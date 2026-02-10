import { dbQuery, isDatabaseEnabled } from "@/lib/db";

type SecurityAlertSeverity = "info" | "warning" | "critical";

interface OutcomeCountRow {
  outcome: string;
  total: number;
}

interface EventOutcomeRow {
  event_type: string;
  outcome: string;
  total: number;
}

interface ScopeHitRow {
  scope: string;
  hits: number;
}

interface RecentAuditEventRow {
  event_type: string;
  outcome: string;
  actor_email: string | null;
  target_email: string | null;
  created_at: string | Date;
}

export interface SecurityAlert {
  code: string;
  severity: SecurityAlertSeverity;
  message: string;
  currentValue: number;
  threshold: number;
}

export interface SecurityTelemetrySnapshot {
  generatedAt: string;
  windows: {
    otpRequest15m: Record<string, number>;
    otpVerify15m: Record<string, number>;
    otpVerify1h: Record<string, number>;
    moderation1h: Record<string, number>;
    adminUserActions1h: Record<string, number>;
  };
  rateLimitScopeHits24h: Array<{ scope: string; hits: number }>;
  recentAuditEvents: Array<{
    eventType: string;
    outcome: string;
    actorEmail: string | null;
    targetEmail: string | null;
    createdAt: string;
  }>;
  alerts: SecurityAlert[];
}

type TelemetryResult =
  | { ok: true; snapshot: SecurityTelemetrySnapshot }
  | { ok: false; reason: "db_unavailable" };

function sumOutcomes(outcomes: Record<string, number>, include: string[]) {
  return include.reduce((total, key) => total + (outcomes[key] || 0), 0);
}

function sumAllOutcomes(outcomes: Record<string, number>) {
  return Object.values(outcomes).reduce((total, value) => total + value, 0);
}

function redactEmail(value: string | null) {
  if (!value) {
    return null;
  }
  const [local, domain] = value.split("@");
  if (!domain) {
    return value;
  }
  const visible = local ? local[0] : "";
  return `${visible}***@${domain}`;
}

async function getOutcomeCounts(eventType: string, minutes: number) {
  const result = await dbQuery<OutcomeCountRow>(
    `
      SELECT outcome, COUNT(*)::int AS total
      FROM security_audit_events
      WHERE event_type = $1
        AND created_at >= NOW() - make_interval(mins => $2)
      GROUP BY outcome
    `,
    [eventType, minutes],
  );

  return Object.fromEntries(result.rows.map((row) => [row.outcome, Number(row.total || 0)]));
}

async function getEventOutcomeCounts(eventTypes: string[], minutes: number) {
  const result = await dbQuery<EventOutcomeRow>(
    `
      SELECT event_type, outcome, COUNT(*)::int AS total
      FROM security_audit_events
      WHERE event_type = ANY($1::text[])
        AND created_at >= NOW() - make_interval(mins => $2)
      GROUP BY event_type, outcome
    `,
    [eventTypes, minutes],
  );

  const summary: Record<string, number> = {};
  for (const row of result.rows) {
    const key = `${row.event_type}:${row.outcome}`;
    summary[key] = Number(row.total || 0);
  }
  return summary;
}

async function getRateLimitScopeHits24h() {
  const result = await dbQuery<ScopeHitRow>(
    `
      SELECT scope, SUM(hits)::int AS hits
      FROM auth_rate_limit_buckets
      WHERE updated_at >= NOW() - INTERVAL '24 hours'
      GROUP BY scope
      ORDER BY hits DESC, scope ASC
      LIMIT 20
    `,
  );

  return result.rows.map((row) => ({
    scope: row.scope,
    hits: Number(row.hits || 0),
  }));
}

async function getRecentAuditEvents(limit = 30) {
  const result = await dbQuery<RecentAuditEventRow>(
    `
      SELECT event_type, outcome, actor_email, target_email, created_at
      FROM security_audit_events
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => ({
    eventType: row.event_type,
    outcome: row.outcome,
    actorEmail: redactEmail(row.actor_email),
    targetEmail: redactEmail(row.target_email),
    createdAt: typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString(),
  }));
}

function buildAlerts(input: {
  otpRequest15m: Record<string, number>;
  otpVerify15m: Record<string, number>;
  otpVerify1h: Record<string, number>;
  moderation1h: Record<string, number>;
  adminUserActions1h: Record<string, number>;
  rateLimitScopeHits24h: Array<{ scope: string; hits: number }>;
}) {
  const alerts: SecurityAlert[] = [];

  const otpVerifyFailures15m = sumOutcomes(input.otpVerify15m, [
    "invalid_code",
    "invalid_or_expired",
    "not_allowed",
    "rate_limited",
  ]);
  if (otpVerifyFailures15m >= 25) {
    alerts.push({
      code: "otp_verify_failures_burst",
      severity: "critical",
      message: "High burst of OTP verify failures in the last 15 minutes.",
      currentValue: otpVerifyFailures15m,
      threshold: 25,
    });
  }

  const otpRequestRateLimited15m = input.otpRequest15m.rate_limited || 0;
  if (otpRequestRateLimited15m >= 20) {
    alerts.push({
      code: "otp_request_rate_limited_spike",
      severity: "warning",
      message: "OTP request rate-limited responses are elevated in the last 15 minutes.",
      currentValue: otpRequestRateLimited15m,
      threshold: 20,
    });
  }

  const moderationActions1h = sumAllOutcomes(input.moderation1h);
  if (moderationActions1h >= 30) {
    alerts.push({
      code: "moderation_action_spike",
      severity: "warning",
      message: "Moderation action volume is elevated in the last hour.",
      currentValue: moderationActions1h,
      threshold: 30,
    });
  }

  const adminAccessActions1h = sumAllOutcomes(input.adminUserActions1h);
  if (adminAccessActions1h >= 20) {
    alerts.push({
      code: "admin_user_action_spike",
      severity: "warning",
      message: "Admin access-management actions are elevated in the last hour.",
      currentValue: adminAccessActions1h,
      threshold: 20,
    });
  }

  const topRateLimitScope = input.rateLimitScopeHits24h[0];
  if (topRateLimitScope && topRateLimitScope.hits >= 1000) {
    alerts.push({
      code: "rate_limit_scope_high_hits",
      severity: "warning",
      message: `Rate-limit bucket '${topRateLimitScope.scope}' has very high hit volume in 24h.`,
      currentValue: topRateLimitScope.hits,
      threshold: 1000,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      code: "no_active_alerts",
      severity: "info",
      message: "No active security alerts for current thresholds.",
      currentValue: 0,
      threshold: 0,
    });
  }

  return alerts;
}

export async function getSecurityTelemetrySnapshot(): Promise<TelemetryResult> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  try {
    const [
      otpRequest15m,
      otpVerify15m,
      otpVerify1h,
      moderation1h,
      adminUserActions1h,
      rateLimitScopeHits24h,
      recentAuditEvents,
    ] = await Promise.all([
      getOutcomeCounts("auth.otp.request", 15),
      getOutcomeCounts("auth.otp.verify", 15),
      getOutcomeCounts("auth.otp.verify", 60),
      getEventOutcomeCounts(["admin.review.moderate"], 60),
      getEventOutcomeCounts(
        [
          "admin.user.update_role",
          "admin.user.delete",
          "admin.user.upsert",
          "admin.listing_images.reorder",
        ],
        60,
      ),
      getRateLimitScopeHits24h(),
      getRecentAuditEvents(),
    ]);

    const alerts = buildAlerts({
      otpRequest15m,
      otpVerify15m,
      otpVerify1h,
      moderation1h,
      adminUserActions1h,
      rateLimitScopeHits24h,
    });

    return {
      ok: true,
      snapshot: {
        generatedAt: new Date().toISOString(),
        windows: {
          otpRequest15m,
          otpVerify15m,
          otpVerify1h,
          moderation1h,
          adminUserActions1h,
        },
        rateLimitScopeHits24h,
        recentAuditEvents,
        alerts,
      },
    };
  } catch (error) {
    console.warn("[SECURITY] Failed to build telemetry snapshot", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return { ok: false, reason: "db_unavailable" };
  }
}

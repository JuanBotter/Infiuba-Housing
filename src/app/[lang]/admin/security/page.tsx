import { notFound } from "next/navigation";

import { getMessages, isSupportedLanguage } from "@/lib/i18n";
import { getSecurityTelemetrySnapshot } from "@/lib/security-telemetry";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface AdminSecurityPageProps {
  params: Promise<{ lang: string }>;
}

function formatCountEntries(entries: Record<string, number>) {
  return Object.entries(entries)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .filter(([, value]) => value > 0);
}

export default async function AdminSecurityPage({ params }: AdminSecurityPageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const messages = getMessages(lang);
  const telemetry = await getSecurityTelemetrySnapshot();

  return (
    <article className="detail-card">
      <h2>Security Telemetry</h2>
      <p>
        Abuse and moderation monitoring summary. Data is based on structured audit events and OTP
        rate-limit buckets.
      </p>

      {!telemetry.ok ? (
        <p className="form-status error">Security telemetry is currently unavailable.</p>
      ) : (
        <>
          <p>
            Snapshot generated at{" "}
            {new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(telemetry.snapshot.generatedAt))}
            .
          </p>

          <h3>Active Alerts</h3>
          <ul>
            {telemetry.snapshot.alerts.map((alert) => (
              <li key={alert.code}>
                <strong>{alert.severity.toUpperCase()}</strong> - {alert.message} ({alert.currentValue}
                {alert.threshold > 0 ? ` / threshold ${alert.threshold}` : ""})
              </li>
            ))}
          </ul>

          <h3>OTP Requests (15m)</h3>
          <ul>
            {formatCountEntries(telemetry.snapshot.windows.otpRequest15m).map(([outcome, total]) => (
              <li key={`otp-request-${outcome}`}>
                {outcome}: {total}
              </li>
            ))}
          </ul>

          <h3>OTP Verifications (15m)</h3>
          <ul>
            {formatCountEntries(telemetry.snapshot.windows.otpVerify15m).map(([outcome, total]) => (
              <li key={`otp-verify-15-${outcome}`}>
                {outcome}: {total}
              </li>
            ))}
          </ul>

          <h3>OTP Verifications (1h)</h3>
          <ul>
            {formatCountEntries(telemetry.snapshot.windows.otpVerify1h).map(([outcome, total]) => (
              <li key={`otp-verify-60-${outcome}`}>
                {outcome}: {total}
              </li>
            ))}
          </ul>

          <h3>Moderation Actions (1h)</h3>
          <ul>
            {formatCountEntries(telemetry.snapshot.windows.moderation1h).map(([outcome, total]) => (
              <li key={`moderation-${outcome}`}>
                {outcome}: {total}
              </li>
            ))}
          </ul>

          <h3>{messages.adminUsersManageTitle} (1h)</h3>
          <ul>
            {formatCountEntries(telemetry.snapshot.windows.adminUserActions1h).map(
              ([outcome, total]) => (
                <li key={`admin-users-${outcome}`}>
                  {outcome}: {total}
                </li>
              ),
            )}
          </ul>

          <h3>Rate-Limit Scope Hits (24h)</h3>
          <ul>
            {telemetry.snapshot.rateLimitScopeHits24h.map((row) => (
              <li key={row.scope}>
                {row.scope}: {row.hits}
              </li>
            ))}
          </ul>

          <h3>Recent Security Audit Events</h3>
          <ul>
            {telemetry.snapshot.recentAuditEvents.map((event) => (
              <li key={`${event.createdAt}-${event.eventType}-${event.outcome}`}>
                [{new Date(event.createdAt).toLocaleString("en-US")}] {event.eventType} -{" "}
                {event.outcome}
                {event.actorEmail ? ` | actor: ${event.actorEmail}` : ""}
                {event.targetEmail ? ` | target: ${event.targetEmail}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

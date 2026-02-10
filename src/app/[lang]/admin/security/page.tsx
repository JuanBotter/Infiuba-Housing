import { notFound } from "next/navigation";

import { getLocaleForLang } from "@/lib/format";
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

function sumCounts(entries: Record<string, number>) {
  return Object.values(entries).reduce((total, value) => total + value, 0);
}

function formatTimestamp(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(getLocaleForLang(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminSecurityPage({ params }: AdminSecurityPageProps) {
  const resolvedParams = await params;
  if (!isSupportedLanguage(resolvedParams.lang)) {
    notFound();
  }

  const lang = resolvedParams.lang as Lang;
  const messages = getMessages(lang);
  const telemetry = await getSecurityTelemetrySnapshot();

  if (!telemetry.ok) {
    return (
      <article className="detail-card security-dashboard">
        <header className="security-dashboard__header">
          <h2>Security Telemetry</h2>
          <p>Centralized monitoring for authentication abuse and admin-sensitive actions.</p>
        </header>
        <p className="form-status error">Security telemetry is currently unavailable.</p>
      </article>
    );
  }

  const { snapshot } = telemetry;
  const generatedAt = formatTimestamp(snapshot.generatedAt, lang);
  const otpVerifyFailures15m = sumCounts(snapshot.windows.otpVerify15m);
  const otpRequestVolume15m = sumCounts(snapshot.windows.otpRequest15m);
  const topRateLimitScope = snapshot.rateLimitScopeHits24h[0];

  const otpRequestEntries = formatCountEntries(snapshot.windows.otpRequest15m);
  const otpVerifyEntries15m = formatCountEntries(snapshot.windows.otpVerify15m);
  const otpVerifyEntries1h = formatCountEntries(snapshot.windows.otpVerify1h);
  const moderationEntries1h = formatCountEntries(snapshot.windows.moderation1h);
  const adminEntries1h = formatCountEntries(snapshot.windows.adminUserActions1h);

  const renderOutcomeList = (entries: Array<[string, number]>) => (
    <ul className="security-list">
      {entries.length === 0 ? <li className="security-list__empty">No events in window.</li> : null}
      {entries.map(([label, value]) => (
        <li key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </li>
      ))}
    </ul>
  );

  return (
    <article className="detail-card security-dashboard">
      <header className="security-dashboard__header">
        <h2>Security Telemetry</h2>
        <p>Centralized monitoring for authentication abuse and admin-sensitive actions.</p>
      </header>

      <section className="security-kpi-grid" aria-label="Security summary metrics">
        <article className="security-kpi">
          <p>Snapshot generated</p>
          <strong>{generatedAt}</strong>
        </article>
        <article className="security-kpi">
          <p>OTP requests (15m)</p>
          <strong>{otpRequestVolume15m}</strong>
        </article>
        <article className="security-kpi">
          <p>OTP verify events (15m)</p>
          <strong>{otpVerifyFailures15m}</strong>
        </article>
        <article className="security-kpi">
          <p>Top rate-limit scope (24h)</p>
          <strong>
            {topRateLimitScope ? `${topRateLimitScope.scope} (${topRateLimitScope.hits})` : "No data"}
          </strong>
        </article>
      </section>

      <section className="security-alerts" aria-label="Active alerts">
        <h3>Active Alerts</h3>
        <div className="security-alerts__grid">
          {snapshot.alerts.map((alert) => (
            <article
              key={alert.code}
              className={`security-alert security-alert--${alert.severity}`}
            >
              <p className="security-alert__severity">{alert.severity}</p>
              <p className="security-alert__message">{alert.message}</p>
              <p className="security-alert__value">
                {alert.currentValue}
                {alert.threshold > 0 ? ` / ${alert.threshold}` : ""}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="security-window-grid" aria-label="Rate limit windows">
        <article className="security-window-card">
          <h3>OTP Requests (15m)</h3>
          {renderOutcomeList(otpRequestEntries)}
        </article>
        <article className="security-window-card">
          <h3>OTP Verifications (15m)</h3>
          {renderOutcomeList(otpVerifyEntries15m)}
        </article>
        <article className="security-window-card">
          <h3>OTP Verifications (1h)</h3>
          {renderOutcomeList(otpVerifyEntries1h)}
        </article>
        <article className="security-window-card">
          <h3>Moderation Actions (1h)</h3>
          {renderOutcomeList(moderationEntries1h)}
        </article>
        <article className="security-window-card">
          <h3>{messages.adminUsersManageTitle} (1h)</h3>
          {renderOutcomeList(adminEntries1h)}
        </article>
        <article className="security-window-card">
          <h3>Rate-Limit Scope Hits (24h)</h3>
          <ul className="security-list">
            {snapshot.rateLimitScopeHits24h.length === 0 ? (
              <li className="security-list__empty">No scope data in window.</li>
            ) : null}
            {snapshot.rateLimitScopeHits24h.map((scopeRow) => (
              <li key={scopeRow.scope}>
                <span>{scopeRow.scope}</span>
                <strong>{scopeRow.hits}</strong>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="security-events" aria-label="Recent security audit events">
        <div className="security-events__header">
          <h3>Recent Security Audit Events</h3>
          <p className="security-events__hint">Sensitive data: API responses are served with no-store headers.</p>
        </div>
        <div className="security-events__table-wrap">
          <table className="security-events__table">
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Event Type</th>
                <th scope="col">Outcome</th>
                <th scope="col">Actor</th>
                <th scope="col">Target</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.recentAuditEvents.map((event) => (
                <tr key={`${event.createdAt}-${event.eventType}-${event.outcome}`}>
                  <td>{formatTimestamp(event.createdAt, lang)}</td>
                  <td>{event.eventType}</td>
                  <td>{event.outcome}</td>
                  <td>{event.actorEmail || "-"}</td>
                  <td>{event.targetEmail || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}

import { notFound } from "next/navigation";

import { getLocaleForLang } from "@/lib/format";
import { isSupportedLanguage } from "@/lib/i18n";
import { getSecurityTelemetrySnapshot } from "@/lib/security-telemetry";
import type { Lang } from "@/types";

export const dynamic = "force-dynamic";

interface AdminSecurityPageProps {
  params: Promise<{ lang: string }>;
}

interface SecurityUiText {
  title: string;
  subtitle: string;
  unavailable: string;
  summaryMetricsAria: string;
  snapshotGenerated: string;
  otpRequests15m: string;
  otpVerifyEvents15m: string;
  topRateLimitScope24h: string;
  noData: string;
  activeAlertsAria: string;
  activeAlertsTitle: string;
  rateLimitWindowsAria: string;
  noEventsInWindow: string;
  otpVerifications15m: string;
  otpVerifications1h: string;
  moderationActions1h: string;
  adminUserActions1h: string;
  rateLimitScopeHits24h: string;
  noScopeDataInWindow: string;
  recentAuditEventsAria: string;
  recentAuditEventsTitle: string;
  sensitiveDataHint: string;
  tableTimestamp: string;
  tableEventType: string;
  tableOutcome: string;
  tableActor: string;
  tableTarget: string;
}

const securityUiTextByLang: Record<Lang, SecurityUiText> = {
  en: {
    title: "Security Telemetry",
    subtitle: "Centralized monitoring for authentication abuse and admin-sensitive actions.",
    unavailable: "Security telemetry is currently unavailable.",
    summaryMetricsAria: "Security summary metrics",
    snapshotGenerated: "Snapshot generated",
    otpRequests15m: "OTP requests (15m)",
    otpVerifyEvents15m: "OTP verify events (15m)",
    topRateLimitScope24h: "Top rate-limit scope (24h)",
    noData: "No data",
    activeAlertsAria: "Active alerts",
    activeAlertsTitle: "Active Alerts",
    rateLimitWindowsAria: "Rate limit windows",
    noEventsInWindow: "No events in window.",
    otpVerifications15m: "OTP Verifications (15m)",
    otpVerifications1h: "OTP Verifications (1h)",
    moderationActions1h: "Moderation Actions (1h)",
    adminUserActions1h: "User Access Actions (1h)",
    rateLimitScopeHits24h: "Rate-Limit Scope Hits (24h)",
    noScopeDataInWindow: "No scope data in window.",
    recentAuditEventsAria: "Recent security audit events",
    recentAuditEventsTitle: "Recent Security Audit Events",
    sensitiveDataHint: "Sensitive data: API responses are served with no-store headers.",
    tableTimestamp: "Timestamp",
    tableEventType: "Event Type",
    tableOutcome: "Outcome",
    tableActor: "Actor",
    tableTarget: "Target",
  },
  es: {
    title: "Telemetría de Seguridad",
    subtitle: "Monitoreo centralizado de abuso de autenticación y acciones administrativas sensibles.",
    unavailable: "La telemetría de seguridad no está disponible en este momento.",
    summaryMetricsAria: "Métricas resumidas de seguridad",
    snapshotGenerated: "Snapshot generado",
    otpRequests15m: "Solicitudes OTP (15 min)",
    otpVerifyEvents15m: "Verificaciones OTP (15 min)",
    topRateLimitScope24h: "Scope con más rate limit (24 h)",
    noData: "Sin datos",
    activeAlertsAria: "Alertas activas",
    activeAlertsTitle: "Alertas activas",
    rateLimitWindowsAria: "Ventanas de límites de tasa",
    noEventsInWindow: "Sin eventos en esta ventana.",
    otpVerifications15m: "Verificaciones OTP (15 min)",
    otpVerifications1h: "Verificaciones OTP (1 h)",
    moderationActions1h: "Acciones de moderación (1 h)",
    adminUserActions1h: "Acciones de gestión de accesos (1 h)",
    rateLimitScopeHits24h: "Hits por scope de rate limit (24 h)",
    noScopeDataInWindow: "Sin datos de scope en esta ventana.",
    recentAuditEventsAria: "Eventos recientes de auditoría de seguridad",
    recentAuditEventsTitle: "Eventos recientes de auditoría de seguridad",
    sensitiveDataHint: "Datos sensibles: las respuestas de la API se sirven con encabezados no-store.",
    tableTimestamp: "Fecha y hora",
    tableEventType: "Tipo de evento",
    tableOutcome: "Resultado",
    tableActor: "Actor",
    tableTarget: "Objetivo",
  },
  fr: {
    title: "Télémétrie de Sécurité",
    subtitle: "Surveillance centralisée des abus d'authentification et des actions admin sensibles.",
    unavailable: "La télémétrie de sécurité est actuellement indisponible.",
    summaryMetricsAria: "Indicateurs de synthèse sécurité",
    snapshotGenerated: "Instantané généré",
    otpRequests15m: "Demandes OTP (15 min)",
    otpVerifyEvents15m: "Vérifications OTP (15 min)",
    topRateLimitScope24h: "Scope de rate-limit principal (24 h)",
    noData: "Aucune donnée",
    activeAlertsAria: "Alertes actives",
    activeAlertsTitle: "Alertes actives",
    rateLimitWindowsAria: "Fenêtres de limitation",
    noEventsInWindow: "Aucun événement dans cette fenêtre.",
    otpVerifications15m: "Vérifications OTP (15 min)",
    otpVerifications1h: "Vérifications OTP (1 h)",
    moderationActions1h: "Actions de modération (1 h)",
    adminUserActions1h: "Actions de gestion des accès (1 h)",
    rateLimitScopeHits24h: "Scopes de rate-limit (24 h)",
    noScopeDataInWindow: "Aucune donnée de scope dans cette fenêtre.",
    recentAuditEventsAria: "Événements récents d'audit sécurité",
    recentAuditEventsTitle: "Événements récents d'audit sécurité",
    sensitiveDataHint:
      "Données sensibles : les réponses API sont servies avec des en-têtes no-store.",
    tableTimestamp: "Horodatage",
    tableEventType: "Type d'événement",
    tableOutcome: "Résultat",
    tableActor: "Acteur",
    tableTarget: "Cible",
  },
  de: {
    title: "Sicherheits-Telemetrie",
    subtitle: "Zentrales Monitoring für Authentifizierungs-Missbrauch und sensible Admin-Aktionen.",
    unavailable: "Die Sicherheits-Telemetrie ist derzeit nicht verfügbar.",
    summaryMetricsAria: "Sicherheitsübersicht",
    snapshotGenerated: "Snapshot erstellt",
    otpRequests15m: "OTP-Anfragen (15 Min.)",
    otpVerifyEvents15m: "OTP-Verifizierungen (15 Min.)",
    topRateLimitScope24h: "Top Rate-Limit-Scope (24 Std.)",
    noData: "Keine Daten",
    activeAlertsAria: "Aktive Warnungen",
    activeAlertsTitle: "Aktive Warnungen",
    rateLimitWindowsAria: "Rate-Limit-Fenster",
    noEventsInWindow: "Keine Ereignisse im Zeitfenster.",
    otpVerifications15m: "OTP-Verifizierungen (15 Min.)",
    otpVerifications1h: "OTP-Verifizierungen (1 Std.)",
    moderationActions1h: "Moderationsaktionen (1 Std.)",
    adminUserActions1h: "Zugriffsverwaltungsaktionen (1 Std.)",
    rateLimitScopeHits24h: "Rate-Limit-Scopes (24 Std.)",
    noScopeDataInWindow: "Keine Scope-Daten im Zeitfenster.",
    recentAuditEventsAria: "Aktuelle Sicherheits-Audit-Ereignisse",
    recentAuditEventsTitle: "Aktuelle Sicherheits-Audit-Ereignisse",
    sensitiveDataHint:
      "Sensible Daten: API-Antworten werden mit no-store-Headern ausgeliefert.",
    tableTimestamp: "Zeitpunkt",
    tableEventType: "Ereignistyp",
    tableOutcome: "Ergebnis",
    tableActor: "Akteur",
    tableTarget: "Ziel",
  },
  pt: {
    title: "Telemetria de Segurança",
    subtitle: "Monitoramento centralizado de abuso de autenticação e ações administrativas sensíveis.",
    unavailable: "A telemetria de segurança está indisponível no momento.",
    summaryMetricsAria: "Métricas resumidas de segurança",
    snapshotGenerated: "Snapshot gerado",
    otpRequests15m: "Solicitações OTP (15 min)",
    otpVerifyEvents15m: "Verificações OTP (15 min)",
    topRateLimitScope24h: "Principal scope de rate limit (24 h)",
    noData: "Sem dados",
    activeAlertsAria: "Alertas ativos",
    activeAlertsTitle: "Alertas ativos",
    rateLimitWindowsAria: "Janelas de limite de taxa",
    noEventsInWindow: "Sem eventos nesta janela.",
    otpVerifications15m: "Verificações OTP (15 min)",
    otpVerifications1h: "Verificações OTP (1 h)",
    moderationActions1h: "Ações de moderação (1 h)",
    adminUserActions1h: "Ações de gestão de acesso (1 h)",
    rateLimitScopeHits24h: "Hits por scope de rate limit (24 h)",
    noScopeDataInWindow: "Sem dados de scope nesta janela.",
    recentAuditEventsAria: "Eventos recentes de auditoria de segurança",
    recentAuditEventsTitle: "Eventos recentes de auditoria de segurança",
    sensitiveDataHint:
      "Dados sensíveis: respostas da API são servidas com cabeçalhos no-store.",
    tableTimestamp: "Data e hora",
    tableEventType: "Tipo de evento",
    tableOutcome: "Resultado",
    tableActor: "Ator",
    tableTarget: "Alvo",
  },
  it: {
    title: "Telemetria di Sicurezza",
    subtitle: "Monitoraggio centralizzato di abusi di autenticazione e azioni admin sensibili.",
    unavailable: "La telemetria di sicurezza non è al momento disponibile.",
    summaryMetricsAria: "Metriche riepilogative di sicurezza",
    snapshotGenerated: "Snapshot generato",
    otpRequests15m: "Richieste OTP (15 min)",
    otpVerifyEvents15m: "Verifiche OTP (15 min)",
    topRateLimitScope24h: "Scope rate-limit principale (24 h)",
    noData: "Nessun dato",
    activeAlertsAria: "Allerte attive",
    activeAlertsTitle: "Allerte attive",
    rateLimitWindowsAria: "Finestre di rate limit",
    noEventsInWindow: "Nessun evento in questa finestra.",
    otpVerifications15m: "Verifiche OTP (15 min)",
    otpVerifications1h: "Verifiche OTP (1 h)",
    moderationActions1h: "Azioni di moderazione (1 h)",
    adminUserActions1h: "Azioni di gestione accessi (1 h)",
    rateLimitScopeHits24h: "Hit per scope rate-limit (24 h)",
    noScopeDataInWindow: "Nessun dato di scope in questa finestra.",
    recentAuditEventsAria: "Eventi recenti di audit sicurezza",
    recentAuditEventsTitle: "Eventi recenti di audit sicurezza",
    sensitiveDataHint:
      "Dati sensibili: le risposte API vengono servite con header no-store.",
    tableTimestamp: "Data e ora",
    tableEventType: "Tipo evento",
    tableOutcome: "Esito",
    tableActor: "Attore",
    tableTarget: "Target",
  },
  no: {
    title: "Sikkerhetstelemetri",
    subtitle: "Sentralisert overvåking av autentiseringsmisbruk og sensitive adminhandlinger.",
    unavailable: "Sikkerhetstelemetri er utilgjengelig akkurat nå.",
    summaryMetricsAria: "Sammendragsmålinger for sikkerhet",
    snapshotGenerated: "Snapshot generert",
    otpRequests15m: "OTP-forespørsler (15 min)",
    otpVerifyEvents15m: "OTP-verifiseringer (15 min)",
    topRateLimitScope24h: "Mest trafikkert rate-limit-scope (24 t)",
    noData: "Ingen data",
    activeAlertsAria: "Aktive varsler",
    activeAlertsTitle: "Aktive varsler",
    rateLimitWindowsAria: "Rate-limit-vinduer",
    noEventsInWindow: "Ingen hendelser i vinduet.",
    otpVerifications15m: "OTP-verifiseringer (15 min)",
    otpVerifications1h: "OTP-verifiseringer (1 t)",
    moderationActions1h: "Modereringshandlinger (1 t)",
    adminUserActions1h: "Tilgangsadministrasjonshandlinger (1 t)",
    rateLimitScopeHits24h: "Rate-limit-scope treff (24 t)",
    noScopeDataInWindow: "Ingen scopedata i vinduet.",
    recentAuditEventsAria: "Nylige sikkerhetsrevisjonshendelser",
    recentAuditEventsTitle: "Nylige sikkerhetsrevisjonshendelser",
    sensitiveDataHint:
      "Sensitive data: API-svar leveres med no-store-headere.",
    tableTimestamp: "Tidspunkt",
    tableEventType: "Hendelsestype",
    tableOutcome: "Utfall",
    tableActor: "Aktør",
    tableTarget: "Mål",
  },
};

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
  const uiText = securityUiTextByLang[lang];
  const telemetry = await getSecurityTelemetrySnapshot();

  if (!telemetry.ok) {
    return (
      <article className="detail-card security-dashboard">
        <header className="security-dashboard__header">
          <h2>{uiText.title}</h2>
          <p>{uiText.subtitle}</p>
        </header>
        <p className="form-status error">{uiText.unavailable}</p>
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
      {entries.length === 0 ? <li className="security-list__empty">{uiText.noEventsInWindow}</li> : null}
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
        <h2>{uiText.title}</h2>
        <p>{uiText.subtitle}</p>
      </header>

      <section className="security-kpi-grid" aria-label={uiText.summaryMetricsAria}>
        <article className="security-kpi">
          <p>{uiText.snapshotGenerated}</p>
          <strong>{generatedAt}</strong>
        </article>
        <article className="security-kpi">
          <p>{uiText.otpRequests15m}</p>
          <strong>{otpRequestVolume15m}</strong>
        </article>
        <article className="security-kpi">
          <p>{uiText.otpVerifyEvents15m}</p>
          <strong>{otpVerifyFailures15m}</strong>
        </article>
        <article className="security-kpi">
          <p>{uiText.topRateLimitScope24h}</p>
          <strong>
            {topRateLimitScope
              ? `${topRateLimitScope.scope} (${topRateLimitScope.hits})`
              : uiText.noData}
          </strong>
        </article>
      </section>

      <section className="security-alerts" aria-label={uiText.activeAlertsAria}>
        <h3>{uiText.activeAlertsTitle}</h3>
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

      <section className="security-window-grid" aria-label={uiText.rateLimitWindowsAria}>
        <article className="security-window-card">
          <h3>{uiText.otpRequests15m}</h3>
          {renderOutcomeList(otpRequestEntries)}
        </article>
        <article className="security-window-card">
          <h3>{uiText.otpVerifications15m}</h3>
          {renderOutcomeList(otpVerifyEntries15m)}
        </article>
        <article className="security-window-card">
          <h3>{uiText.otpVerifications1h}</h3>
          {renderOutcomeList(otpVerifyEntries1h)}
        </article>
        <article className="security-window-card">
          <h3>{uiText.moderationActions1h}</h3>
          {renderOutcomeList(moderationEntries1h)}
        </article>
        <article className="security-window-card">
          <h3>{uiText.adminUserActions1h}</h3>
          {renderOutcomeList(adminEntries1h)}
        </article>
        <article className="security-window-card">
          <h3>{uiText.rateLimitScopeHits24h}</h3>
          <ul className="security-list">
            {snapshot.rateLimitScopeHits24h.length === 0 ? (
              <li className="security-list__empty">{uiText.noScopeDataInWindow}</li>
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

      <section className="security-events" aria-label={uiText.recentAuditEventsAria}>
        <div className="security-events__header">
          <h3>{uiText.recentAuditEventsTitle}</h3>
          <p className="security-events__hint">{uiText.sensitiveDataHint}</p>
        </div>
        <div className="security-events__table-wrap">
          <table className="security-events__table">
            <thead>
              <tr>
                <th scope="col">{uiText.tableTimestamp}</th>
                <th scope="col">{uiText.tableEventType}</th>
                <th scope="col">{uiText.tableOutcome}</th>
                <th scope="col">{uiText.tableActor}</th>
                <th scope="col">{uiText.tableTarget}</th>
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

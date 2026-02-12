import { withNoStore } from "@/lib/http-cache";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

interface CspReportPayload {
  "document-uri"?: unknown;
  "violated-directive"?: unknown;
  "effective-directive"?: unknown;
  "blocked-uri"?: unknown;
  "source-file"?: unknown;
  "line-number"?: unknown;
  disposition?: unknown;
}

function asSafeString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 300) : undefined;
}

function asSafeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseCspReportPayload(raw: unknown): CspReportPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const nested = input["csp-report"];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as CspReportPayload;
  }

  return input as CspReportPayload;
}

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const report = parseCspReportPayload(rawBody);

  await recordSecurityAuditEvent({
    eventType: "security.csp.report",
    outcome: report ? "received" : "invalid_request",
    metadata: report
      ? {
          documentUri: asSafeString(report["document-uri"]),
          violatedDirective: asSafeString(report["violated-directive"]),
          effectiveDirective: asSafeString(report["effective-directive"]),
          blockedUri: asSafeString(report["blocked-uri"]),
          sourceFile: asSafeString(report["source-file"]),
          lineNumber: asSafeNumber(report["line-number"]),
          disposition: asSafeString(report.disposition),
        }
      : undefined,
  });

  return withNoStore(new Response(null, { status: 204 }));
}

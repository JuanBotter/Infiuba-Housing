import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

let POST: typeof import("@/app/api/security/csp-report/route").POST;
let mockedAudit: typeof import("@/lib/security-audit");

beforeAll(async () => {
  POST = (await import("@/app/api/security/csp-report/route")).POST;
  mockedAudit = vi.mocked(await import("@/lib/security-audit"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/security/csp-report", () => {
  it("records normalized CSP violation reports", async () => {
    const response = await POST(
      new Request("http://localhost/api/security/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://example.com/es",
            "violated-directive": "script-src-elem",
            "effective-directive": "script-src-elem",
            "blocked-uri": "inline",
            "source-file": "https://example.com/_next/static/chunk.js",
            "line-number": 42,
          },
        }),
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mockedAudit.recordSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "security.csp.report",
        outcome: "received",
        metadata: expect.objectContaining({
          violatedDirective: "script-src-elem",
          lineNumber: 42,
        }),
      }),
    );
  });

  it("records invalid_request for malformed payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/security/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad-json",
      }),
    );

    expect(response.status).toBe(204);
    expect(mockedAudit.recordSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "security.csp.report",
        outcome: "invalid_request",
      }),
    );
  });
});

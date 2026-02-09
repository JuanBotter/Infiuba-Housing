import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  buildRoleCookie: vi.fn(() => ({ name: "infiuba_role", value: "test", path: "/" })),
  resolveOtpMagicLinkToken: vi.fn(() => ({ ok: false })),
  verifyLoginOtp: vi.fn(),
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

let GET: typeof import("@/app/api/session/magic/route").GET;
let mockedAuth: typeof import("@/lib/auth");
let mockedAudit: typeof import("@/lib/security-audit");

beforeAll(async () => {
  const route = await import("@/app/api/session/magic/route");
  GET = route.GET;
  mockedAuth = vi.mocked(await import("@/lib/auth"));
  mockedAudit = vi.mocked(await import("@/lib/security-audit"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/session/magic", () => {
  it("redirects to default language on missing token", async () => {
    const response = await GET(new Request("http://localhost/api/session/magic"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/es");
    expect(mockedAudit.recordSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "auth.otp.verify",
        outcome: "invalid_request",
      }),
    );
  });

  it("redirects to requested language on invalid token", async () => {
    mockedAuth.resolveOtpMagicLinkToken.mockReturnValueOnce({ ok: false });

    const response = await GET(
      new Request("http://localhost/api/session/magic?lang=fr&token=bad-token"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/fr");
    expect(mockedAudit.recordSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "auth.otp.verify",
        outcome: "invalid_or_expired",
      }),
    );
  });

  it("verifies token, sets cookie, and redirects", async () => {
    mockedAuth.resolveOtpMagicLinkToken.mockReturnValueOnce({
      ok: true,
      email: "student@example.com",
      otpCode: "123456",
    });
    mockedAuth.verifyLoginOtp.mockResolvedValueOnce({
      ok: true,
      role: "whitelisted",
      email: "student@example.com",
    });

    const response = await GET(
      new Request("http://localhost/api/session/magic?lang=de&token=valid-token"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/de");
    expect(mockedAuth.verifyLoginOtp).toHaveBeenCalledWith(
      "student@example.com",
      "123456",
      expect.any(Object),
    );
    expect(mockedAuth.buildRoleCookie).toHaveBeenCalledWith("whitelisted", {
      authMethod: "otp",
      email: "student@example.com",
      trustDevice: false,
    });
    expect(response.headers.get("set-cookie")).toContain("infiuba_role=test");
    expect(mockedAudit.recordSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "auth.otp.verify",
        outcome: "ok",
        actorEmail: "student@example.com",
      }),
    );
  });
});

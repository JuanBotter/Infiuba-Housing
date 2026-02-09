import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  buildRoleCookie: vi.fn(() => ({ name: "infiuba_role", value: "test", path: "/" })),
  buildRoleCookieClear: vi.fn(() => ({ name: "infiuba_role", value: "", path: "/", maxAge: 0 })),
  getAuthSessionFromRequest: vi.fn(async () => ({ role: "visitor" })),
  requestLoginOtp: vi.fn(),
  verifyLoginOtp: vi.fn(),
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

let GET: typeof import("@/app/api/session/route").GET;
let POST: typeof import("@/app/api/session/route").POST;
let DELETE: typeof import("@/app/api/session/route").DELETE;
let mockedAuth: typeof import("@/lib/auth");

beforeAll(async () => {
  const route = await import("@/app/api/session/route");
  GET = route.GET;
  POST = route.POST;
  DELETE = route.DELETE;
  mockedAuth = vi.mocked(await import("@/lib/auth"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/session", () => {
  it("rejects unsupported actions", async () => {
    const response = await POST(buildRequest({ action: "nope", email: "user@example.com" }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid origin", async () => {
    const response = await POST(
      new Request("http://localhost/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://evil.example",
        },
        body: JSON.stringify({ action: "requestOtp", email: "user@example.com" }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("returns 400 when requestOtp payload is missing email", async () => {
    const response = await POST(buildRequest({ action: "requestOtp" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when requestOtp returns invalid email", async () => {
    mockedAuth.requestLoginOtp.mockResolvedValueOnce({ ok: false, reason: "invalid_email" });

    const response = await POST(buildRequest({ action: "requestOtp", email: "bad-email" }));
    expect(response.status).toBe(400);
  });

  it("returns 503 when requestOtp needs database", async () => {
    mockedAuth.requestLoginOtp.mockResolvedValueOnce({ ok: false, reason: "db_unavailable" });

    const response = await POST(
      buildRequest({ action: "requestOtp", email: "student@example.com" }),
    );
    expect(response.status).toBe(503);
  });

  it("returns 200 when requestOtp is not allowed (non-enumerating)", async () => {
    mockedAuth.requestLoginOtp.mockResolvedValueOnce({ ok: false, reason: "not_allowed" });

    const response = await POST(
      buildRequest({ action: "requestOtp", email: "student@example.com" }),
    );
    expect(response.status).toBe(200);
  });

  it("returns 200 and ok when requestOtp succeeds", async () => {
    mockedAuth.requestLoginOtp.mockResolvedValueOnce({
      ok: true,
      email: "student@example.com",
      expiresAt: "2026-02-01T00:00:00.000Z",
    });

    const response = await POST(
      buildRequest({ action: "requestOtp", email: "student@example.com" }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.email).toBe("student@example.com");
  });

  it("passes requestOtp language and origin context", async () => {
    mockedAuth.requestLoginOtp.mockResolvedValueOnce({
      ok: true,
      email: "student@example.com",
      expiresAt: "2026-02-01T00:00:00.000Z",
    });

    const response = await POST(
      buildRequest({ action: "requestOtp", email: "student@example.com", lang: "fr" }),
    );
    expect(response.status).toBe(200);
    expect(mockedAuth.requestLoginOtp).toHaveBeenCalledWith(
      "student@example.com",
      expect.any(Object),
      {
        lang: "fr",
        appOrigin: "http://localhost",
      },
    );
  });

  it("returns 200 when verifyOtp succeeds", async () => {
    mockedAuth.verifyLoginOtp.mockResolvedValueOnce({
      ok: true,
      role: "admin",
      email: "admin@example.com",
    });

    const response = await POST(
      buildRequest({
        action: "verifyOtp",
        email: "admin@example.com",
        otpCode: "123456",
        trustDevice: true,
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.role).toBe("admin");
    expect(mockedAuth.buildRoleCookie).toHaveBeenCalledWith("admin", {
      authMethod: "otp",
      email: "admin@example.com",
      trustDevice: true,
    });
  });

  it("returns 400 when verifyOtp payload is missing values", async () => {
    const response = await POST(buildRequest({ action: "verifyOtp", email: "" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when verifyOtp returns invalid email", async () => {
    mockedAuth.verifyLoginOtp.mockResolvedValueOnce({ ok: false, reason: "invalid_email" });

    const response = await POST(
      buildRequest({ action: "verifyOtp", email: "bad", otpCode: "123456" }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 503 when verifyOtp needs database", async () => {
    mockedAuth.verifyLoginOtp.mockResolvedValueOnce({ ok: false, reason: "db_unavailable" });

    const response = await POST(
      buildRequest({ action: "verifyOtp", email: "admin@example.com", otpCode: "123456" }),
    );
    expect(response.status).toBe(503);
  });

  it("returns 401 when verifyOtp fails", async () => {
    mockedAuth.verifyLoginOtp.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_or_expired",
    });

    const response = await POST(
      buildRequest({
        action: "verifyOtp",
        email: "admin@example.com",
        otpCode: "123456",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns current session on GET", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "whitelisted" });
    const response = await GET(new Request("http://localhost/api/session"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.role).toBe("whitelisted");
  });

  it("clears session on DELETE", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/session", {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects DELETE with invalid origin", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/session", {
        method: "DELETE",
        headers: { origin: "http://evil.example" },
      }),
    );
    expect(response.status).toBe(403);
  });
});

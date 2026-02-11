import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  canAccessAdmin: vi.fn(),
  getAuthSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  isDatabaseEnabled: vi.fn(),
}));

vi.mock("@/lib/request-origin", () => ({
  validateSameOriginRequest: vi.fn(() => ({ ok: true })),
}));

let jsonError: typeof import("@/lib/api-route-helpers").jsonError;
let requireAdminSession: typeof import("@/lib/api-route-helpers").requireAdminSession;
let requireDb: typeof import("@/lib/api-route-helpers").requireDb;
let requireSameOrigin: typeof import("@/lib/api-route-helpers").requireSameOrigin;
let mockedAuth: typeof import("@/lib/auth");
let mockedDb: typeof import("@/lib/db");
let mockedOrigin: typeof import("@/lib/request-origin");

beforeAll(async () => {
  const helpers = await import("@/lib/api-route-helpers");
  jsonError = helpers.jsonError;
  requireAdminSession = helpers.requireAdminSession;
  requireDb = helpers.requireDb;
  requireSameOrigin = helpers.requireSameOrigin;

  mockedAuth = vi.mocked(await import("@/lib/auth"));
  mockedDb = vi.mocked(await import("@/lib/db"));
  mockedOrigin = vi.mocked(await import("@/lib/request-origin"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedDb.isDatabaseEnabled.mockReturnValue(true);
  mockedOrigin.validateSameOriginRequest.mockReturnValue({ ok: true });
  mockedAuth.getAuthSessionFromRequest.mockResolvedValue({ role: "admin" });
  mockedAuth.canAccessAdmin.mockReturnValue(true);
});

describe("api-route-helpers", () => {
  it("builds regular json errors", async () => {
    const response = jsonError("Invalid payload");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
  });

  it("builds no-store json errors when requested", async () => {
    const response = jsonError("Unauthorized", { status: 401, noStore: true });
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });

  it("passes same-origin checks when validation succeeds", () => {
    const response = requireSameOrigin(new Request("http://localhost/api/session"));
    expect(response).toBeNull();
  });

  it("wraps failed same-origin responses with no-store when requested", () => {
    mockedOrigin.validateSameOriginRequest.mockReturnValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid request origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const response = requireSameOrigin(new Request("http://localhost/api/session"), {
      noStore: true,
    });
    expect(response?.status).toBe(403);
    expect(response?.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });

  it("returns null when database is enabled", () => {
    const response = requireDb();
    expect(response).toBeNull();
  });

  it("returns a configurable database error response", async () => {
    mockedDb.isDatabaseEnabled.mockReturnValueOnce(false);
    const response = requireDb({
      errorMessage: "Database is required for OTP login",
      status: 503,
      noStore: true,
    });
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    await expect(response?.json()).resolves.toEqual({
      error: "Database is required for OTP login",
    });
  });

  it("returns validated admin session", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({
      role: "admin",
      authMethod: "otp",
      email: "admin@example.com",
    });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);

    const result = await requireAdminSession(
      new Request("http://localhost/api/admin/users"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.email).toBe("admin@example.com");
    }
  });

  it("returns unauthorized for non-admin sessions", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "whitelisted" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(false);

    const result = await requireAdminSession(
      new Request("http://localhost/api/admin/users"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
      await expect(result.response.json()).resolves.toEqual({ error: "Unauthorized" });
    }
  });
});

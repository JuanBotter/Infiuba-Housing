import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  canAccessAdmin: vi.fn(),
  getAuthSessionFromRequest: vi.fn(),
  getManagedUsers: vi.fn(),
  getDeletedUsers: vi.fn(),
  updateUserRole: vi.fn(),
  deleteUser: vi.fn(),
  upsertUsers: vi.fn(),
}));

let GET: typeof import("@/app/api/admin/users/route").GET;
let POST: typeof import("@/app/api/admin/users/route").POST;
let mockedAuth: typeof import("@/lib/auth");

beforeAll(async () => {
  const route = await import("@/app/api/admin/users/route");
  GET = route.GET;
  POST = route.POST;
  mockedAuth = vi.mocked(await import("@/lib/auth"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

function buildRequest(
  body: Record<string, unknown>,
  options: { origin?: string; url?: string } = {},
) {
  return new Request(options.url ?? "http://localhost/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: options.origin ?? "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/users", () => {
  it("returns 401 when user is not admin", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "visitor" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(false);

    const response = await GET(new Request("http://localhost/api/admin/users"));
    expect(response.status).toBe(401);
  });

  it("returns active and deleted users", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.getManagedUsers.mockResolvedValueOnce({
      ok: true,
      users: [
        {
          email: "admin@example.com",
          role: "admin",
          isActive: true,
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    mockedAuth.getDeletedUsers.mockResolvedValueOnce({
      ok: true,
      users: [{ email: "deleted@example.com", deletedAt: "2026-01-31T00:00:00.000Z" }],
    });

    const response = await GET(new Request("http://localhost/api/admin/users"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.active).toHaveLength(1);
    expect(payload.deleted).toHaveLength(1);
  });

  it("returns 503 when managed users lookup fails", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.getManagedUsers.mockResolvedValueOnce({ ok: false });

    const response = await GET(new Request("http://localhost/api/admin/users"));
    expect(response.status).toBe(503);
  });

  it("returns 503 when deleted users lookup fails", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.getManagedUsers.mockResolvedValueOnce({ ok: true, users: [] });
    mockedAuth.getDeletedUsers.mockResolvedValueOnce({ ok: false });

    const response = await GET(new Request("http://localhost/api/admin/users"));
    expect(response.status).toBe(503);
  });

  it("rejects invalid origin for POST", async () => {
    const response = await POST(
      buildRequest({ action: "updateRole" }, { origin: "http://evil.example" }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects updateRole without payload", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);

    const response = await POST(buildRequest({ action: "updateRole" }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when updateRole target is missing", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.updateUserRole.mockResolvedValueOnce({ ok: false, reason: "not_found" });

    const response = await POST(
      buildRequest({ action: "updateRole", email: "missing@example.com", role: "admin" }),
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 when updateRole email is invalid", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.updateUserRole.mockResolvedValueOnce({ ok: false, reason: "invalid_email" });

    const response = await POST(buildRequest({ action: "updateRole", email: "nope", role: "admin" }));
    expect(response.status).toBe(400);
  });

  it("returns 503 when updateRole db is unavailable", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.updateUserRole.mockResolvedValueOnce({ ok: false, reason: "db_unavailable" });

    const response = await POST(buildRequest({ action: "updateRole", email: "user@example.com", role: "admin" }));
    expect(response.status).toBe(503);
  });

  it("updates role successfully", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.updateUserRole.mockResolvedValueOnce({
      ok: true,
      user: {
        email: "user@example.com",
        role: "admin",
        isActive: true,
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-02T00:00:00.000Z",
      },
    });

    const response = await POST(buildRequest({ action: "updateRole", email: "user@example.com", role: "admin" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
  });

  it("prevents deleting own account", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);

    const response = await POST(buildRequest({ action: "delete", email: "admin@example.com" }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when delete target is missing", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.deleteUser.mockResolvedValueOnce({ ok: false, reason: "not_found" });

    const response = await POST(buildRequest({ action: "delete", email: "missing@example.com" }));
    expect(response.status).toBe(404);
  });

  it("deletes user successfully", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.deleteUser.mockResolvedValueOnce({ ok: true });

    const response = await POST(buildRequest({ action: "delete", email: "user@example.com" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
  });

  it("rejects upsert with only invalid emails", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);

    const response = await POST(
      buildRequest({ action: "upsert", emails: "not-an-email,also-bad", role: "whitelisted" }),
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.invalidEmails).toHaveLength(2);
  });

  it("returns 503 when upsert db is unavailable", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.upsertUsers.mockResolvedValueOnce({ ok: false, reason: "db_unavailable" });

    const response = await POST(
      buildRequest({ action: "upsert", emails: "user1@example.com,user2@example.com", role: "whitelisted" }),
    );
    expect(response.status).toBe(503);
  });

  it("upserts users and returns invalid emails list", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);
    mockedAuth.upsertUsers.mockResolvedValueOnce({ ok: true, count: 2 });

    const response = await POST(
      buildRequest({
        action: "upsert",
        emails: "good@example.com, bad-email, another@example.com",
        role: "whitelisted",
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.invalidEmails).toEqual(["bad-email"]);
  });
});

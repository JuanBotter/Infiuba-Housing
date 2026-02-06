import { beforeAll, describe, expect, it, vi } from "vitest";

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

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost",
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

  it("rejects updateRole without payload", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);

    const response = await POST(buildRequest({ action: "updateRole" }));
    expect(response.status).toBe(400);
  });

  it("prevents deleting own account", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "admin", email: "admin@example.com" });
    mockedAuth.canAccessAdmin.mockReturnValueOnce(true);

    const response = await POST(buildRequest({ action: "delete", email: "admin@example.com" }));
    expect(response.status).toBe(400);
  });
});

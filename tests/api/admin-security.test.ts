import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-route-helpers", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("@/lib/security-telemetry", () => ({
  getSecurityTelemetrySnapshot: vi.fn(),
}));

let GET: typeof import("@/app/api/admin/security/route").GET;
let mockedRouteHelpers: typeof import("@/lib/api-route-helpers");
let mockedSecurityTelemetry: typeof import("@/lib/security-telemetry");

beforeAll(async () => {
  GET = (await import("@/app/api/admin/security/route")).GET;
  mockedRouteHelpers = vi.mocked(await import("@/lib/api-route-helpers"));
  mockedSecurityTelemetry = vi.mocked(await import("@/lib/security-telemetry"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/admin/security GET", () => {
  it("returns telemetry snapshot when available", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedSecurityTelemetry.getSecurityTelemetrySnapshot.mockResolvedValueOnce({
      ok: true,
      snapshot: {
        windows: [],
        alerts: [],
        recentEvents: [],
      },
    } as never);

    const response = await GET(new Request("http://localhost/api/admin/security"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      windows: [],
      alerts: [],
      recentEvents: [],
    });
  });

  it("returns 503 when telemetry lookup fails", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedSecurityTelemetry.getSecurityTelemetrySnapshot.mockResolvedValueOnce({
      ok: false,
      reason: "db_unavailable",
    } as never);

    const response = await GET(new Request("http://localhost/api/admin/security"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "Security telemetry is unavailable",
    });
  });
});

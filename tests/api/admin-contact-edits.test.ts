import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-route-helpers", () => ({
  requireAdminSession: vi.fn(),
  requireDb: vi.fn(() => null),
  requireSameOrigin: vi.fn(() => null),
}));

vi.mock("@/lib/db", () => ({
  dbQuery: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("@/lib/cache-tags", () => ({
  revalidatePublicListing: vi.fn(),
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

let GET: typeof import("@/app/api/admin/contact-edits/route").GET;
let POST: typeof import("@/app/api/admin/contact-edits/route").POST;
let mockedRouteHelpers: typeof import("@/lib/api-route-helpers");
let mockedDb: typeof import("@/lib/db");
let mockedCacheTags: typeof import("@/lib/cache-tags");
let mockedSecurityAudit: typeof import("@/lib/security-audit");

beforeAll(async () => {
  const route = await import("@/app/api/admin/contact-edits/route");
  GET = route.GET;
  POST = route.POST;
  mockedRouteHelpers = vi.mocked(await import("@/lib/api-route-helpers"));
  mockedDb = vi.mocked(await import("@/lib/db"));
  mockedCacheTags = vi.mocked(await import("@/lib/cache-tags"));
  mockedSecurityAudit = vi.mocked(await import("@/lib/security-audit"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedRouteHelpers.requireDb.mockReturnValue(null);
  mockedRouteHelpers.requireSameOrigin.mockReturnValue(null);
});

function buildPostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/contact-edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/contact-edits", () => {
  it("returns pending and history entries", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedDb.dbQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          listing_id: "listing-1",
          address: "Address 1",
          neighborhood: "Recoleta",
          requester_email: "student@example.com",
          requested_contacts: ["new-owner@example.com"],
          current_contacts: ["old-owner@example.com"],
          requested_capacity: 4,
          current_capacity: 3,
          status: "pending",
          created_at: "2026-02-10T00:00:00.000Z",
          reviewed_at: null,
          reviewed_by_email: null,
        },
        {
          id: 2,
          listing_id: "listing-2",
          address: "Address 2",
          neighborhood: "Palermo",
          requester_email: "student-2@example.com",
          requested_contacts: ["owner@example.com"],
          current_contacts: ["owner-old@example.com"],
          requested_capacity: null,
          current_capacity: 2,
          status: "approved",
          created_at: "2026-02-09T00:00:00.000Z",
          reviewed_at: "2026-02-09T01:00:00.000Z",
          reviewed_by_email: "admin@example.com",
        },
      ],
    } as never);

    const response = await GET(new Request("http://localhost/api/admin/contact-edits"));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.pending).toHaveLength(1);
    expect(payload.history).toHaveLength(1);
    expect(payload.pending[0]).toMatchObject({
      id: "1",
      listingId: "listing-1",
      status: "pending",
    });
  });

  it("rejects invalid moderation payloads", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });

    const response = await POST(buildPostRequest({ action: "approve" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid payload",
    });
  });

  it("approves a request and revalidates listing cache", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedDb.withTransaction.mockResolvedValueOnce({
      ok: true,
      request: {
        id: 9,
        listing_id: "listing-9",
        requester_email: "student@example.com",
      },
    } as never);

    const response = await POST(buildPostRequest({ action: "approve", requestId: "9" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mockedSecurityAudit.recordSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "contact_edit.moderate",
        outcome: "approved",
        actorEmail: "admin@example.com",
      }),
    );
    expect(mockedCacheTags.revalidatePublicListing).toHaveBeenCalledWith("listing-9");
  });
});

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  canRequestContactEdits: vi.fn(),
  getAuthSessionFromRequest: vi.fn(),
  getRoleFromRequestAsync: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  dbQuery: vi.fn(),
  isDatabaseEnabled: vi.fn(),
}));

vi.mock("@/lib/request-origin", () => ({
  validateSameOriginRequest: vi.fn(),
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

let POST: typeof import("@/app/api/contact-edits/route").POST;
let mockedAuth: typeof import("@/lib/auth");
let mockedDb: typeof import("@/lib/db");
let mockedRequestOrigin: typeof import("@/lib/request-origin");
let mockedSecurityAudit: typeof import("@/lib/security-audit");

beforeAll(async () => {
  POST = (await import("@/app/api/contact-edits/route")).POST;
  mockedAuth = vi.mocked(await import("@/lib/auth"));
  mockedDb = vi.mocked(await import("@/lib/db"));
  mockedRequestOrigin = vi.mocked(await import("@/lib/request-origin"));
  mockedSecurityAudit = vi.mocked(await import("@/lib/security-audit"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequestOrigin.validateSameOriginRequest.mockReturnValue({ ok: true });
  mockedAuth.getRoleFromRequestAsync.mockResolvedValue("whitelisted");
  mockedAuth.canRequestContactEdits.mockReturnValue(true);
  mockedDb.isDatabaseEnabled.mockReturnValue(true);
  mockedAuth.getAuthSessionFromRequest.mockResolvedValue({
    role: "whitelisted",
    email: "student@example.com",
  });
});

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/contact-edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/contact-edits POST", () => {
  it("rejects unauthorized users", async () => {
    mockedAuth.canRequestContactEdits.mockReturnValueOnce(false);

    const response = await POST(buildRequest({ listingId: "listing-1", contacts: "owner@example.com" }));

    expect(response.status).toBe(401);
  });

  it("rejects payloads without listing id", async () => {
    const response = await POST(buildRequest({ contacts: "owner@example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Missing listing",
    });
  });

  it("requires at least one contact or capacity", async () => {
    const response = await POST(buildRequest({ listingId: "listing-1", contacts: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Contact info or capacity is required",
    });
  });

  it("stores a pending contact-edit request", async () => {
    mockedDb.dbQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ address: "Address 1", neighborhood: "Recoleta", capacity: 3 }],
    } as never);
    mockedDb.dbQuery.mockResolvedValueOnce({
      rowCount: 2,
      rows: [{ contact: "owner@example.com" }, { contact: "+54 11 4444 1111" }],
    } as never);
    mockedDb.dbQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);

    const response = await POST(
      buildRequest({
        listingId: "listing-1",
        contacts: "new-owner@example.com,+54 11 1111 2222",
        capacity: 4,
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mockedDb.dbQuery).toHaveBeenCalledTimes(3);
    expect(mockedSecurityAudit.recordSecurityAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "contact_edit.request",
        outcome: "submitted",
        actorEmail: "student@example.com",
      }),
    );
  });
});

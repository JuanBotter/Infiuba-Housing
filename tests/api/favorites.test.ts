import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getAuthSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  isDatabaseEnabled: vi.fn(),
}));

vi.mock("@/lib/favorites", () => ({
  getFavoriteListingIdsForUser: vi.fn(),
  setListingFavoriteForUser: vi.fn(),
}));

vi.mock("@/lib/request-origin", () => ({
  validateSameOriginRequest: vi.fn(() => ({ ok: true })),
}));

let GET: typeof import("@/app/api/favorites/route").GET;
let POST: typeof import("@/app/api/favorites/route").POST;
let mockedAuth: typeof import("@/lib/auth");
let mockedDb: typeof import("@/lib/db");
let mockedFavorites: typeof import("@/lib/favorites");
let mockedOrigin: typeof import("@/lib/request-origin");

beforeAll(async () => {
  const route = await import("@/app/api/favorites/route");
  GET = route.GET;
  POST = route.POST;

  mockedAuth = vi.mocked(await import("@/lib/auth"));
  mockedDb = vi.mocked(await import("@/lib/db"));
  mockedFavorites = vi.mocked(await import("@/lib/favorites"));
  mockedOrigin = vi.mocked(await import("@/lib/request-origin"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedDb.isDatabaseEnabled.mockReturnValue(true);
  mockedOrigin.validateSameOriginRequest.mockReturnValue({ ok: true });
});

function buildPostRequest(body: Record<string, unknown>, origin = "http://localhost") {
  return new Request("http://localhost/api/favorites", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
  });
}

describe("/api/favorites", () => {
  it("returns 503 when database is unavailable on GET", async () => {
    mockedDb.isDatabaseEnabled.mockReturnValueOnce(false);

    const response = await GET(new Request("http://localhost/api/favorites"));
    expect(response.status).toBe(503);
  });

  it("returns empty favorites for visitors", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "visitor" });

    const response = await GET(new Request("http://localhost/api/favorites"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      loggedIn: false,
      listingIds: [],
    });
  });

  it("returns listing ids for logged-in users", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({
      role: "whitelisted",
      authMethod: "otp",
      email: "student@example.com",
    });
    mockedFavorites.getFavoriteListingIdsForUser.mockResolvedValueOnce({
      ok: true,
      listingIds: ["listing-1", "listing-2"],
    });

    const response = await GET(new Request("http://localhost/api/favorites"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      loggedIn: true,
      listingIds: ["listing-1", "listing-2"],
    });
  });

  it("returns 503 when favorites schema is missing on GET", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({
      role: "whitelisted",
      authMethod: "otp",
      email: "student@example.com",
    });
    mockedFavorites.getFavoriteListingIdsForUser.mockResolvedValueOnce({
      ok: false,
      reason: "schema_missing",
    });

    const response = await GET(new Request("http://localhost/api/favorites"));
    expect(response.status).toBe(503);
  });

  it("rejects invalid origin on POST", async () => {
    mockedOrigin.validateSameOriginRequest.mockReturnValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid request origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const response = await POST(buildPostRequest({ action: "add", listingId: "abc" }));
    expect(response.status).toBe(403);
  });

  it("returns 401 on POST when user is not authenticated", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({ role: "visitor" });

    const response = await POST(buildPostRequest({ action: "add", listingId: "abc" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({
      role: "whitelisted",
      authMethod: "otp",
      email: "student@example.com",
    });

    const response = await POST(buildPostRequest({ action: "nope", listingId: "" }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when listing does not exist", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({
      role: "whitelisted",
      authMethod: "otp",
      email: "student@example.com",
    });
    mockedFavorites.setListingFavoriteForUser.mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    });

    const response = await POST(buildPostRequest({ action: "add", listingId: "missing-listing" }));
    expect(response.status).toBe(404);
  });

  it("returns 503 when favorites schema is missing on POST", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({
      role: "whitelisted",
      authMethod: "otp",
      email: "student@example.com",
    });
    mockedFavorites.setListingFavoriteForUser.mockResolvedValueOnce({
      ok: false,
      reason: "schema_missing",
    });

    const response = await POST(buildPostRequest({ action: "add", listingId: "listing-1" }));
    expect(response.status).toBe(503);
  });

  it("removes favorite successfully", async () => {
    mockedAuth.getAuthSessionFromRequest.mockResolvedValueOnce({
      role: "admin",
      authMethod: "otp",
      email: "admin@example.com",
    });
    mockedFavorites.setListingFavoriteForUser.mockResolvedValueOnce({
      ok: true,
      listingId: "listing-1",
      favorite: false,
    });

    const response = await POST(buildPostRequest({ action: "remove", listingId: "listing-1" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      listingId: "listing-1",
      favorite: false,
    });
  });
});

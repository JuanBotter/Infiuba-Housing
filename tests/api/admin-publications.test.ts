import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-route-helpers", () => ({
  requireAdminSession: vi.fn(),
  requireDb: vi.fn(() => null),
  requireSameOrigin: vi.fn(() => null),
}));

vi.mock("@/lib/admin-listing-images", () => ({
  getAdminListingImageSummaries: vi.fn(),
  getAdminListingImageDetail: vi.fn(),
  setAdminListingImageOrder: vi.fn(),
  updateAdminListingDetails: vi.fn(),
  deleteAdminListingImage: vi.fn(),
}));

vi.mock("@/lib/cache-tags", () => ({
  revalidatePublicListing: vi.fn(),
  revalidatePublicListingWithApprovedReviews: vi.fn(),
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

let GET: typeof import("@/app/api/admin/publications/route").GET;
let POST: typeof import("@/app/api/admin/publications/route").POST;
let mockedRouteHelpers: typeof import("@/lib/api-route-helpers");
let mockedAdminListingImages: typeof import("@/lib/admin-listing-images");
let mockedCacheTags: typeof import("@/lib/cache-tags");

beforeAll(async () => {
  const route = await import("@/app/api/admin/publications/route");
  GET = route.GET;
  POST = route.POST;
  mockedRouteHelpers = vi.mocked(await import("@/lib/api-route-helpers"));
  mockedAdminListingImages = vi.mocked(await import("@/lib/admin-listing-images"));
  mockedCacheTags = vi.mocked(await import("@/lib/cache-tags"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedRouteHelpers.requireDb.mockReturnValue(null);
  mockedRouteHelpers.requireSameOrigin.mockReturnValue(null);
});

describe("/api/admin/publications", () => {
  it("returns listing summaries when listingId is not provided", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedAdminListingImages.getAdminListingImageSummaries.mockResolvedValueOnce([
      {
        id: "listing-1",
        address: "Address 1",
        neighborhood: "Recoleta",
        imageCount: 2,
      },
    ]);

    const response = await GET(new Request("http://localhost/api/admin/publications"));

    expect(response.status).toBe(200);
    expect(mockedAdminListingImages.getAdminListingImageSummaries).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      listings: [
        {
          id: "listing-1",
          address: "Address 1",
          neighborhood: "Recoleta",
          imageCount: 2,
        },
      ],
    });
  });

  it("returns 404 when listing detail does not exist", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedAdminListingImages.getAdminListingImageDetail.mockResolvedValueOnce({
      ok: false,
      reason: "not_found",
    });

    const response = await GET(
      new Request("http://localhost/api/admin/publications?listingId=missing-listing"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Listing not found",
    });
  });

  it("saves listing image order and revalidates listing cache", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedAdminListingImages.setAdminListingImageOrder.mockResolvedValueOnce({
      ok: true,
      listingId: "listing-1",
      orderedImages: ["https://img/1.jpg", "https://img/2.jpg"],
    });

    const response = await POST(
      new Request("http://localhost/api/admin/publications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          action: "saveImageOrder",
          listingId: "listing-1",
          orderedImageUrls: ["https://img/1.jpg", "https://img/2.jpg"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedAdminListingImages.setAdminListingImageOrder).toHaveBeenCalledWith("listing-1", [
      "https://img/1.jpg",
      "https://img/2.jpg",
    ]);
    expect(mockedCacheTags.revalidatePublicListing).toHaveBeenCalledWith("listing-1");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      listingId: "listing-1",
      orderedImages: ["https://img/1.jpg", "https://img/2.jpg"],
    });
  });
});

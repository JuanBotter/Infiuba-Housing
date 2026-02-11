import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-route-helpers", () => ({
  requireAdminSession: vi.fn(),
  requireSameOrigin: vi.fn(() => null),
}));

vi.mock("@/lib/reviews-store", () => ({
  getPendingReviews: vi.fn(),
  getApprovedReviewsPage: vi.fn(),
  getApprovedReviewsTotal: vi.fn(),
  moderatePendingReview: vi.fn(),
}));

vi.mock("@/lib/cache-tags", () => ({
  revalidatePublicListingWithApprovedReviews: vi.fn(),
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

let GET: typeof import("@/app/api/admin/reviews/route").GET;
let mockedRouteHelpers: typeof import("@/lib/api-route-helpers");
let mockedReviewsStore: typeof import("@/lib/reviews-store");

beforeAll(async () => {
  const route = await import("@/app/api/admin/reviews/route");
  GET = route.GET;
  mockedRouteHelpers = vi.mocked(await import("@/lib/api-route-helpers"));
  mockedReviewsStore = vi.mocked(await import("@/lib/reviews-store"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/admin/reviews GET", () => {
  it("returns paginated approved reviews and total count", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedReviewsStore.getPendingReviews.mockResolvedValueOnce([]);
    mockedReviewsStore.getApprovedReviewsPage.mockResolvedValueOnce([
      {
        id: "review-1",
        listingId: "listing-1",
        rating: 5,
        recommended: true,
        comment: "Great stay.",
        createdAt: "2026-01-01T00:00:00.000Z",
        approvedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    mockedReviewsStore.getApprovedReviewsTotal.mockResolvedValueOnce(42);

    const response = await GET(
      new Request("http://localhost/api/admin/reviews?approvedLimit=15&approvedOffset=30"),
    );

    expect(response.status).toBe(200);
    expect(mockedReviewsStore.getApprovedReviewsPage).toHaveBeenCalledWith(15, 30);
    expect(mockedReviewsStore.getApprovedReviewsTotal).toHaveBeenCalledTimes(1);

    const payload = await response.json();
    expect(payload.approvedTotal).toBe(42);
    expect(payload.approvedLimit).toBe(15);
    expect(payload.approvedOffset).toBe(30);
    expect(payload.approved).toHaveLength(1);
  });

  it("clamps invalid pagination query values", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedReviewsStore.getPendingReviews.mockResolvedValueOnce([]);
    mockedReviewsStore.getApprovedReviewsPage.mockResolvedValueOnce([]);
    mockedReviewsStore.getApprovedReviewsTotal.mockResolvedValueOnce(0);

    const response = await GET(
      new Request("http://localhost/api/admin/reviews?approvedLimit=999&approvedOffset=-10"),
    );

    expect(response.status).toBe(200);
    expect(mockedReviewsStore.getApprovedReviewsPage).toHaveBeenCalledWith(100, 0);
  });
});

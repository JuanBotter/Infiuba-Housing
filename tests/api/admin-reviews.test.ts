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
  updateReviewByAdmin: vi.fn(),
}));

vi.mock("@/lib/cache-tags", () => ({
  revalidatePublicListingWithApprovedReviews: vi.fn(),
}));

vi.mock("@/lib/security-audit", () => ({
  recordSecurityAuditEvent: vi.fn(),
}));

let GET: typeof import("@/app/api/admin/reviews/route").GET;
let POST: typeof import("@/app/api/admin/reviews/route").POST;
let mockedRouteHelpers: typeof import("@/lib/api-route-helpers");
let mockedReviewsStore: typeof import("@/lib/reviews-store");

beforeAll(async () => {
  const route = await import("@/app/api/admin/reviews/route");
  GET = route.GET;
  POST = route.POST;
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
        source: "survey",
        status: "approved",
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

describe("/api/admin/reviews POST", () => {
  function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/admin/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify(body),
    });
  }

  it("rejects edit payload with invalid rating", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });

    const response = await POST(
      buildRequest({ action: "edit", reviewId: "review-1", rating: 99 }),
    );

    expect(response.status).toBe(400);
  });

  it("updates approved reviews with edit action", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });
    mockedReviewsStore.updateReviewByAdmin.mockResolvedValueOnce({
      ok: true,
      review: {
        id: "review-1",
        listingId: "listing-1",
        source: "survey",
        status: "approved",
      },
    } as never);

    const response = await POST(
      buildRequest({
        action: "edit",
        reviewId: "review-1",
        rating: 4,
        recommended: true,
        comment: "Updated review text",
        semester: "1C-2026",
        priceUsd: 1300,
        studentName: "Jane Doe",
        studentContact: "+54 11 1234 1234",
        studentEmail: "jane@example.com",
        shareContactInfo: true,
        reviewImageUrls: ["https://demo.public.blob.vercel-storage.com/review-1.jpg"],
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedReviewsStore.updateReviewByAdmin).toHaveBeenCalledWith(
      "review-1",
      expect.objectContaining({
        rating: 4,
        recommended: true,
        comment: "Updated review text",
        imageUrls: ["https://demo.public.blob.vercel-storage.com/review-1.jpg"],
      }),
    );
  });

  it("rejects edit payload with untrusted review image host", async () => {
    mockedRouteHelpers.requireAdminSession.mockResolvedValueOnce({
      ok: true,
      session: { role: "admin", email: "admin@example.com" },
    });

    const response = await POST(
      buildRequest({
        action: "edit",
        reviewId: "review-1",
        rating: 4,
        recommended: true,
        comment: "Updated review text",
        reviewImageUrls: ["https://example.com/review-1.jpg"],
      }),
    );

    expect(response.status).toBe(400);
  });
});

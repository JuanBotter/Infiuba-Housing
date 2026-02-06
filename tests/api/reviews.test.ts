import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  canSubmitReviews: vi.fn(),
  getRoleFromRequestAsync: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  createListing: vi.fn(),
  getListingById: vi.fn(),
}));

vi.mock("@/lib/reviews-store", () => ({
  appendPendingReview: vi.fn(),
}));

vi.mock("@/lib/request-origin", () => ({
  validateSameOriginRequest: vi.fn(() => ({ ok: true })),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

let POST: typeof import("@/app/api/reviews/route").POST;
let mockedAuth: typeof import("@/lib/auth");
let mockedData: typeof import("@/lib/data");

beforeAll(async () => {
  POST = (await import("@/app/api/reviews/route")).POST;
  mockedAuth = vi.mocked(await import("@/lib/auth"));
  mockedData = vi.mocked(await import("@/lib/data"));
});

describe("/api/reviews", () => {
  it("rejects unauthorized review submissions", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("visitor");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(false);

    const request = new Request("http://localhost/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 5 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("accepts valid review for existing listing", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);
    mockedData.getListingById.mockResolvedValueOnce({ id: "listing-1" } as never);

    const request = new Request("http://localhost/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: "listing-1",
        confirmExistingDetails: true,
        rating: 4,
        recommended: true,
        comment: "This place was comfortable and clean.",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
  });
});

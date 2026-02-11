import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { REVIEW_API_ERROR_CODES } from "@/lib/review-api-errors";

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
let mockedReviews: typeof import("@/lib/reviews-store");
let mockedOrigin: typeof import("@/lib/request-origin");
let mockedCache: typeof import("next/cache");

beforeAll(async () => {
  POST = (await import("@/app/api/reviews/route")).POST;
  mockedAuth = vi.mocked(await import("@/lib/auth"));
  mockedData = vi.mocked(await import("@/lib/data"));
  mockedReviews = vi.mocked(await import("@/lib/reviews-store"));
  mockedOrigin = vi.mocked(await import("@/lib/request-origin"));
  mockedCache = vi.mocked(await import("next/cache"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedOrigin.validateSameOriginRequest.mockReturnValue({ ok: true });
});

function buildReviewRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseReviewPayload = {
  rating: 4,
  recommended: true,
  comment: "Great stay with good location.",
  semester: "1C-2026",
  priceUsd: 420,
};

describe("/api/reviews", () => {
  it("rejects unauthorized review submissions", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("visitor");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(false);

    const request = buildReviewRequest({ rating: 5 });

    const response = await POST(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: REVIEW_API_ERROR_CODES.SUBMIT_NOT_ALLOWED,
        message: "Only whitelisted students can submit reviews.",
      }),
    );
  });

  it("rejects invalid recommendation value", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);

    const response = await POST(
      buildReviewRequest({
        listingId: "listing-1",
        confirmExistingDetails: true,
        ...baseReviewPayload,
        recommended: "yes",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid rating", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);

    const request = buildReviewRequest({
      listingId: "listing-1",
      confirmExistingDetails: true,
      ...baseReviewPayload,
      rating: 10,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: REVIEW_API_ERROR_CODES.INVALID_RATING,
        message: "Invalid rating",
      }),
    );
  });

  it("rejects short comments", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);

    const response = await POST(
      buildReviewRequest({
        listingId: "listing-1",
        confirmExistingDetails: true,
        ...baseReviewPayload,
        comment: "Too short",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid rent values", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);

    const response = await POST(
      buildReviewRequest({
        listingId: "listing-1",
        confirmExistingDetails: true,
        ...baseReviewPayload,
        priceUsd: -50,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid student email", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);

    const response = await POST(
      buildReviewRequest({
        listingId: "listing-1",
        confirmExistingDetails: true,
        ...baseReviewPayload,
        studentEmail: "not-an-email",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("requires contact info when sharing is enabled", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);

    const response = await POST(
      buildReviewRequest({
        listingId: "listing-1",
        confirmExistingDetails: true,
        ...baseReviewPayload,
        shareContactInfo: true,
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: REVIEW_API_ERROR_CODES.CONTACT_SHARE_REQUIRES_CONTACT,
      }),
    );
  });

  it("rejects invalid listingId", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);
    mockedData.getListingById.mockResolvedValueOnce(null as never);

    const response = await POST(
      buildReviewRequest({
        listingId: "missing",
        confirmExistingDetails: true,
        ...baseReviewPayload,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("accepts valid review for existing listing", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);
    mockedData.getListingById.mockResolvedValueOnce({ id: "listing-1" } as never);

    const request = buildReviewRequest({
      listingId: "listing-1",
      confirmExistingDetails: true,
      ...baseReviewPayload,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
  });

  it("accepts legacy existing listing payload without confirmation", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);
    mockedData.getListingById.mockResolvedValueOnce({ id: "listing-legacy" } as never);

    const response = await POST(
      buildReviewRequest({
        listingId: "listing-legacy",
        ...baseReviewPayload,
        comment: "Legacy payload still works.",
      }),
    );
    expect(response.status).toBe(201);
  });

  it("requires detail confirmation for existing listing", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);
    mockedData.getListingById.mockResolvedValueOnce({ id: "listing-2" } as never);

    const request = buildReviewRequest({
      listingId: "listing-2",
      confirmExistingDetails: false,
      ...baseReviewPayload,
      comment: "Good spot, but confirm details.",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects mismatched latitude/longitude for new listing", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);

    const response = await POST(
      buildReviewRequest({
        ...baseReviewPayload,
        address: "Calle Falsa 123",
        neighborhood: "Palermo",
        contacts: "+54 9 11 5555-5555",
        capacity: 3,
        latitude: -34.6,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects overly long contact entries for new listing", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);
    const longContact = "x".repeat(181);

    const response = await POST(
      buildReviewRequest({
        ...baseReviewPayload,
        address: "Calle Falsa 123",
        neighborhood: "Palermo",
        contacts: longContact,
        capacity: 3,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("creates a new listing and revalidates tags", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);
    mockedData.createListing.mockResolvedValueOnce({ listingId: "listing-new" } as never);
    mockedReviews.appendPendingReview.mockResolvedValueOnce();

    const response = await POST(
      buildReviewRequest({
        ...baseReviewPayload,
        address: "Calle Falsa 123",
        neighborhood: "Palermo",
        contacts: "+54 9 11 5555-5555",
        capacity: 3,
        latitude: -34.6,
        longitude: -58.4,
      }),
    );

    expect(response.status).toBe(201);
    expect(mockedCache.revalidateTag).toHaveBeenCalledWith("public-listings", "max");
    expect(mockedCache.revalidateTag).toHaveBeenCalledWith("public-neighborhoods", "max");
    expect(mockedCache.revalidateTag).toHaveBeenCalledWith("public-dataset-meta", "max");
  });

  it("passes normalized review image URLs to persistence layers", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);
    mockedData.createListing.mockResolvedValueOnce({ listingId: "listing-images" } as never);
    mockedReviews.appendPendingReview.mockResolvedValueOnce();

    const response = await POST(
      buildReviewRequest({
        ...baseReviewPayload,
        address: "Calle Falsa 321",
        neighborhood: "Recoleta",
        contacts: "+54 9 11 4444-4444",
        capacity: 2,
        listingImageUrls: [
          "https://example.com/property-photo.jpg",
          "https://example.com/property-photo.jpg",
        ],
        reviewImageUrls: [
          "https://example.com/review-photo.jpg",
          "https://example.com/review-photo.jpg",
        ],
      }),
    );

    expect(response.status).toBe(201);
    const createListingPayload = mockedData.createListing.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(createListingPayload?.imageUrls).toBeUndefined();
    expect(mockedReviews.appendPendingReview).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: ["https://example.com/review-photo.jpg"],
      }),
    );
  });

  it("returns structured code for too many review images", async () => {
    mockedAuth.getRoleFromRequestAsync.mockResolvedValueOnce("whitelisted");
    mockedAuth.canSubmitReviews.mockReturnValueOnce(true);

    const response = await POST(
      buildReviewRequest({
        listingId: "listing-1",
        confirmExistingDetails: true,
        ...baseReviewPayload,
        reviewImageUrls: Array.from({ length: 7 }, (_, index) => `https://example.com/${index}.jpg`),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        code: REVIEW_API_ERROR_CODES.REVIEW_IMAGES_TOO_MANY,
      }),
    );
  });
});

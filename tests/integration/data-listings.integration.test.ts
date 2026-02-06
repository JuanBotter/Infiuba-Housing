import { beforeEach, describe, expect, it } from "vitest";

import { createListing, getListingById, getListings } from "@/lib/data";
import {
  appendPendingReview,
  getApprovedReviews,
  getPendingReviews,
  moderatePendingReview,
} from "@/lib/reviews-store";
import { resetIntegrationDatabase } from "./helpers";

describe("integration: listings and reviews", () => {
  beforeEach(async () => {
    await resetIntegrationDatabase();
  });

  it("creates a listing and exposes it via listing queries", async () => {
    const created = await createListing({
      address: "Calle Falsa 123",
      neighborhood: "Palermo",
      contacts: ["+54 9 11 5555-5555"],
      capacity: 2,
      latitude: -34.6,
      longitude: -58.4,
    });

    const listing = await getListingById(created.listingId, "en", {
      includeOwnerContactInfo: true,
      includeReviewerContactInfo: false,
    });
    expect(listing?.address).toBe("Calle Falsa 123");
    expect(listing?.contacts).toContain("+54 9 11 5555-5555");

    const listings = await getListings({
      includeOwnerContactInfo: false,
      includeReviewerContactInfo: false,
    });
    expect(listings.length).toBe(1);
    expect(listings[0].contacts).toHaveLength(0);

  });

  it("stores pending and approved reviews", async () => {
    const created = await createListing({
      address: "Avenida Siempre Viva 742",
      neighborhood: "Belgrano",
      contacts: ["owner@example.com"],
    });

    const pending = await appendPendingReview({
      listingId: created.listingId,
      rating: 5,
      recommended: true,
      comment: "Great spot for students.",
      priceUsd: 400,
    });

    const pendingReviews = await getPendingReviews();
    expect(pendingReviews).toHaveLength(1);
    expect(pendingReviews[0].id).toBe(pending.id);

    const moderation = await moderatePendingReview(pending.id, "approve");
    expect(moderation.ok).toBe(true);

    const approved = await getApprovedReviews();
    expect(approved).toHaveLength(1);
    expect(approved[0].priceUsd).toBe(400);
  });
});

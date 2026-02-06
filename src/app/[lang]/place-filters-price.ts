import type { Listing } from "@/types";

function getListingReviewPrices(listing: Listing) {
  return (listing.reviewPrices || []).filter((price): price is number => Number.isFinite(price));
}

export function hasReviewPriceInRange(
  listing: Listing,
  minValue: number | undefined,
  maxValue: number | undefined,
) {
  const prices = getListingReviewPrices(listing);
  if (prices.length === 0) {
    return false;
  }

  return prices.some((price) => {
    if (typeof minValue === "number" && price < minValue) {
      return false;
    }
    if (typeof maxValue === "number" && price > maxValue) {
      return false;
    }
    return true;
  });
}

export function getListingMinReviewPrice(listing: Listing) {
  const prices = getListingReviewPrices(listing);
  if (prices.length === 0) {
    return undefined;
  }

  return Math.min(...prices);
}

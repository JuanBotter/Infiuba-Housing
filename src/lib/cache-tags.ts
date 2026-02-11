import { revalidateTag } from "next/cache";

export const PUBLIC_LISTINGS_TAG = "public-listings";
export const PUBLIC_NEIGHBORHOODS_TAG = "public-neighborhoods";
export const PUBLIC_DATASET_META_TAG = "public-dataset-meta";
export const PUBLIC_APPROVED_REVIEWS_TAG = "public-approved-reviews";

export function publicListingTag(listingId: string) {
  return `public-listing:${listingId}`;
}

export function publicApprovedReviewsTag(listingId: string) {
  return `public-approved-reviews:${listingId}`;
}

function revalidatePublicTag(tag: string) {
  revalidateTag(tag, "max");
}

export function revalidatePublicListingsDataset() {
  revalidatePublicTag(PUBLIC_LISTINGS_TAG);
  revalidatePublicTag(PUBLIC_NEIGHBORHOODS_TAG);
  revalidatePublicTag(PUBLIC_DATASET_META_TAG);
}

export function revalidatePublicListing(listingId: string) {
  const normalizedListingId = listingId.trim();
  revalidatePublicTag(PUBLIC_LISTINGS_TAG);
  if (normalizedListingId) {
    revalidatePublicTag(publicListingTag(normalizedListingId));
  }
}

export function revalidatePublicListingWithApprovedReviews(listingId: string) {
  const normalizedListingId = listingId.trim();
  revalidatePublicListing(normalizedListingId);
  revalidatePublicTag(PUBLIC_APPROVED_REVIEWS_TAG);
  if (normalizedListingId) {
    revalidatePublicTag(publicApprovedReviewsTag(normalizedListingId));
  }
}

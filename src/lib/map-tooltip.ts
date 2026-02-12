import type { Listing } from "@/types";

const HTML_ESCAPE_REPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeMapTooltipText(value: string) {
  return value.replace(/[&<>"']/g, (match) => HTML_ESCAPE_REPLACEMENTS[match] ?? match);
}

export function buildListingTooltipHtml(
  listing: Pick<Listing, "address" | "neighborhood" | "totalReviews">,
  reviewsLabel: string,
) {
  const headline = `${listing.address} · ${listing.neighborhood}`;
  const reviewsLine = `${listing.totalReviews} ${reviewsLabel}`;
  return `${escapeMapTooltipText(headline)}<br>${escapeMapTooltipText(reviewsLine)}`;
}

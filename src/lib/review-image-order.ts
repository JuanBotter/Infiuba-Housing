import { dbQuery } from "@/lib/db";

interface ListingReviewImageRow {
  listing_id: string;
  image_url: string;
}

function normalizeImageUrlList(values: string[] | null | undefined) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => value.trim())
    .filter(Boolean);
}

function uniquePreservingOrder(values: string[]) {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}

export function applyStoredReviewImageOrder(
  storedOrder: string[] | null | undefined,
  availableImages: string[],
) {
  const available = uniquePreservingOrder(normalizeImageUrlList(availableImages));
  if (available.length === 0) {
    return [];
  }

  const availableSet = new Set(available);
  const preferred = uniquePreservingOrder(normalizeImageUrlList(storedOrder)).filter((url) =>
    availableSet.has(url),
  );
  const preferredSet = new Set(preferred);
  const remaining = available.filter((url) => !preferredSet.has(url));

  return [...preferred, ...remaining];
}

export async function getApprovedReviewImagesMap(listingIds: string[]) {
  const normalizedListingIds = listingIds
    .map((value) => value.trim())
    .filter(Boolean);

  if (normalizedListingIds.length === 0) {
    return new Map<string, string[]>();
  }

  const result = await dbQuery<ListingReviewImageRow>(
    `
      SELECT
        r.listing_id,
        image_rows.image_url
      FROM reviews r
      CROSS JOIN LATERAL unnest(r.image_urls) WITH ORDINALITY AS image_rows(image_url, image_index)
      WHERE r.listing_id = ANY($1::text[])
        AND r.status = 'approved'
      ORDER BY
        r.listing_id ASC,
        COALESCE(r.approved_at, r.created_at) DESC,
        r.created_at DESC,
        r.id DESC,
        image_rows.image_index ASC
    `,
    [normalizedListingIds],
  );

  const byListing = new Map<string, string[]>();
  for (const row of result.rows) {
    const current = byListing.get(row.listing_id) || [];
    current.push(row.image_url);
    byListing.set(row.listing_id, current);
  }

  for (const [listingId, urls] of byListing.entries()) {
    byListing.set(listingId, uniquePreservingOrder(normalizeImageUrlList(urls)));
  }

  return byListing;
}

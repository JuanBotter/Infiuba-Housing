import { dbQuery, withTransaction } from "@/lib/db";
import {
  applyStoredReviewImageOrder,
  getApprovedReviewImagesMap,
} from "@/lib/review-image-order";

interface AdminListingImageSummaryRow {
  id: string;
  address: string;
  neighborhood: string;
  total_reviews: number;
}

interface ListingOrderRow {
  id: string;
  address: string;
  neighborhood: string;
  image_urls: string[] | null;
}

interface ApprovedImageRow {
  image_url: string;
}

export interface AdminListingImageSummary {
  id: string;
  address: string;
  neighborhood: string;
  totalReviews: number;
  imageCount: number;
}

export interface AdminListingImageDetail {
  id: string;
  address: string;
  neighborhood: string;
  orderedImages: string[];
}

function normalizeImageUrls(values: string[] | null | undefined) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function getAdminListingImageSummaries() {
  const listingsResult = await dbQuery<AdminListingImageSummaryRow>(
    `
      SELECT
        id,
        address,
        neighborhood,
        total_reviews
      FROM listings
      ORDER BY neighborhood ASC, address ASC
    `,
  );
  const approvedImagesByListing = await getApprovedReviewImagesMap(
    listingsResult.rows.map((row) => row.id),
  );

  return listingsResult.rows.map((row) => ({
    id: row.id,
    address: row.address,
    neighborhood: row.neighborhood,
    totalReviews: Number(row.total_reviews || 0),
    imageCount: (approvedImagesByListing.get(row.id) || []).length,
  }));
}

export async function getAdminListingImageDetail(listingId: string) {
  const normalizedListingId = listingId.trim();
  if (!normalizedListingId) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const [listingResult, approvedImagesByListing] = await Promise.all([
    dbQuery<ListingOrderRow>(
      `
        SELECT
          id,
          address,
          neighborhood,
          image_urls
        FROM listings
        WHERE id = $1
      `,
      [normalizedListingId],
    ),
    getApprovedReviewImagesMap([normalizedListingId]),
  ]);

  if (listingResult.rowCount === 0) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const row = listingResult.rows[0];
  const availableImages = approvedImagesByListing.get(normalizedListingId) || [];
  const orderedImages = applyStoredReviewImageOrder(row.image_urls, availableImages);

  const detail: AdminListingImageDetail = {
    id: row.id,
    address: row.address,
    neighborhood: row.neighborhood,
    orderedImages,
  };

  return { ok: true as const, detail };
}

export async function setAdminListingImageOrder(listingId: string, orderedImageUrls: string[]) {
  const normalizedListingId = listingId.trim();
  if (!normalizedListingId) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const normalizedOrdered = normalizeImageUrls(orderedImageUrls);

  return withTransaction(async (client) => {
    const listingResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM listings
        WHERE id = $1
        FOR UPDATE
      `,
      [normalizedListingId],
    );

    if (listingResult.rowCount === 0) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const approvedImagesResult = await client.query<ApprovedImageRow>(
      `
        SELECT image_rows.image_url
        FROM reviews r
        CROSS JOIN LATERAL unnest(r.image_urls) WITH ORDINALITY AS image_rows(image_url, image_index)
        WHERE r.listing_id = $1
          AND r.status = 'approved'
        ORDER BY
          COALESCE(r.approved_at, r.created_at) DESC,
          r.created_at DESC,
          r.id DESC,
          image_rows.image_index ASC
      `,
      [normalizedListingId],
    );
    const availableImages = approvedImagesResult.rows.map((row) => row.image_url);
    const availableSet = new Set(availableImages);

    if (normalizedOrdered.some((imageUrl) => !availableSet.has(imageUrl))) {
      return { ok: false as const, reason: "invalid_images" as const };
    }

    const nextOrder = applyStoredReviewImageOrder(normalizedOrdered, availableImages);
    await client.query(
      `
        UPDATE listings
        SET image_urls = $2::text[],
            updated_at = NOW()
        WHERE id = $1
      `,
      [normalizedListingId, nextOrder],
    );

    return {
      ok: true as const,
      listingId: normalizedListingId,
      orderedImages: nextOrder,
    };
  });
}

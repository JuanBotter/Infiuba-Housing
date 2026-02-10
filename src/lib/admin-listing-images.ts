import { dbQuery, withTransaction } from "@/lib/db";
import {
  applyStoredReviewImageOrder,
  getApprovedReviewImagesMap,
} from "@/lib/review-image-order";

const MAX_CONTACTS = 20;
const MAX_CONTACT_LENGTH = 180;

interface AdminListingImageSummaryRow {
  id: string;
  address: string;
  neighborhood: string;
  total_reviews: number;
}

interface ListingDetailRow {
  id: string;
  address: string;
  neighborhood: string;
  capacity: string | number | null;
  contacts: string[] | null;
  image_urls: string[] | null;
}

interface ListingLockRow {
  id: string;
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
  capacity?: number;
  contacts: string[];
  orderedImages: string[];
}

export interface AdminListingDetailsInput {
  address: string;
  neighborhood: string;
  capacity?: number;
  contacts: string[];
}

function toOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeImageUrls(values: string[] | null | undefined) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeContacts(values: string[]) {
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    deduped.add(normalized);
  }

  return Array.from(deduped);
}

async function queryApprovedImagesForListing(
  client: { query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  listingId: string,
) {
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
    [listingId],
  );

  return normalizeImageUrls(approvedImagesResult.rows.map((row) => row.image_url));
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
    dbQuery<ListingDetailRow>(
      `
        SELECT
          l.id,
          l.address,
          l.neighborhood,
          l.capacity,
          l.image_urls,
          COALESCE(array_agg(c.contact ORDER BY c.contact ASC) FILTER (WHERE c.contact IS NOT NULL), '{}') AS contacts
        FROM listings l
        LEFT JOIN listing_contacts c ON c.listing_id = l.id
        WHERE l.id = $1
        GROUP BY l.id
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
    capacity: toOptionalNumber(row.capacity),
    contacts: normalizeContacts(row.contacts || []),
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

    const availableImages = await queryApprovedImagesForListing(client, normalizedListingId);
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

export async function updateAdminListingDetails(
  listingId: string,
  details: AdminListingDetailsInput,
) {
  const normalizedListingId = listingId.trim();
  const normalizedAddress = details.address.trim();
  const normalizedNeighborhood = details.neighborhood.trim();
  const normalizedContacts = normalizeContacts(details.contacts);

  if (!normalizedListingId) {
    return { ok: false as const, reason: "not_found" as const };
  }
  if (!normalizedAddress || normalizedAddress.length > 180) {
    return { ok: false as const, reason: "invalid_address" as const };
  }
  if (!normalizedNeighborhood || normalizedNeighborhood.length > 80) {
    return { ok: false as const, reason: "invalid_neighborhood" as const };
  }
  if (normalizedContacts.length > MAX_CONTACTS) {
    return { ok: false as const, reason: "too_many_contacts" as const };
  }
  if (normalizedContacts.some((contact) => contact.length > MAX_CONTACT_LENGTH)) {
    return { ok: false as const, reason: "contact_too_long" as const };
  }
  if (
    details.capacity !== undefined &&
    (!Number.isFinite(details.capacity) || details.capacity <= 0 || details.capacity > 50)
  ) {
    return { ok: false as const, reason: "invalid_capacity" as const };
  }

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

    await client.query(
      `
        UPDATE listings
        SET address = $2,
            neighborhood = $3,
            capacity = $4,
            updated_at = NOW()
        WHERE id = $1
      `,
      [normalizedListingId, normalizedAddress, normalizedNeighborhood, details.capacity ?? null],
    );

    await client.query(`DELETE FROM listing_contacts WHERE listing_id = $1`, [normalizedListingId]);

    if (normalizedContacts.length > 0) {
      await client.query(
        `
          INSERT INTO listing_contacts (listing_id, contact)
          SELECT $1, contact
          FROM UNNEST($2::text[]) AS contact
        `,
        [normalizedListingId, normalizedContacts],
      );
    }

    return {
      ok: true as const,
      listingId: normalizedListingId,
      address: normalizedAddress,
      neighborhood: normalizedNeighborhood,
      capacity: details.capacity,
      contacts: normalizedContacts,
    };
  });
}

export async function deleteAdminListingImage(listingId: string, imageUrl: string) {
  const normalizedListingId = listingId.trim();
  const normalizedImageUrl = imageUrl.trim();

  if (!normalizedListingId) {
    return { ok: false as const, reason: "not_found" as const };
  }
  if (!normalizedImageUrl) {
    return { ok: false as const, reason: "invalid_image" as const };
  }

  return withTransaction(async (client) => {
    const listingResult = await client.query<ListingLockRow>(
      `
        SELECT id, image_urls
        FROM listings
        WHERE id = $1
        FOR UPDATE
      `,
      [normalizedListingId],
    );

    if (listingResult.rowCount === 0) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const availableImages = await queryApprovedImagesForListing(client, normalizedListingId);
    if (!availableImages.includes(normalizedImageUrl)) {
      return { ok: false as const, reason: "invalid_image" as const };
    }

    const removedFromReviews = await client.query(
      `
        UPDATE reviews
        SET image_urls = array_remove(image_urls, $2)
        WHERE listing_id = $1
          AND image_urls @> ARRAY[$2]::text[]
      `,
      [normalizedListingId, normalizedImageUrl],
    );

    const previousOrder = normalizeImageUrls(listingResult.rows[0]?.image_urls).filter(
      (url) => url !== normalizedImageUrl,
    );
    const remainingAvailableImages = await queryApprovedImagesForListing(client, normalizedListingId);
    const nextOrder = applyStoredReviewImageOrder(previousOrder, remainingAvailableImages);

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
      removedCount: removedFromReviews.rowCount || 0,
    };
  });
}

import { createHash, randomUUID } from "node:crypto";

import { dbQuery, withTransaction } from "@/lib/db";
import { getTranslatedCommentForLanguage } from "@/lib/review-translations";
import type { Lang, Listing, Review } from "@/types";

function toOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function slugify(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

interface ListingRow {
  id: string;
  address: string;
  neighborhood: string;
  latitude: string | number | null;
  longitude: string | number | null;
  contacts: string[] | null;
  price_usd: string | number | null;
  capacity: string | number | null;
  average_rating: string | number | null;
  recommendation_rate: string | number | null;
  total_reviews: number;
  recent_year: number | null;
  min_price_usd: string | number | null;
  max_price_usd: string | number | null;
  review_prices: (string | number)[] | null;
}

interface ListingPrivacyOptions {
  // Legacy option: when provided, applies to both owner and reviewer contacts.
  includePrivateContactInfo?: boolean;
  includeOwnerContactInfo?: boolean;
  includeReviewerContactInfo?: boolean;
  lang?: Lang;
}

function resolvePrivacyOptions(options: ListingPrivacyOptions) {
  const includePrivateContactInfo = options.includePrivateContactInfo;
  const includeOwnerContactInfo =
    options.includeOwnerContactInfo ?? includePrivateContactInfo ?? true;
  const includeReviewerContactInfo =
    options.includeReviewerContactInfo ?? includePrivateContactInfo ?? true;

  return {
    includeOwnerContactInfo,
    includeReviewerContactInfo,
  };
}

function mapListingRow(row: ListingRow): Listing {
  const reviewPrices = (row.review_prices || [])
    .map((value) => toOptionalNumber(value))
    .filter((value): value is number => typeof value === "number");

  return {
    id: row.id,
    address: row.address,
    neighborhood: row.neighborhood,
    latitude: toOptionalNumber(row.latitude),
    longitude: toOptionalNumber(row.longitude),
    contacts: row.contacts || [],
    priceUsd: toOptionalNumber(row.price_usd),
    minPriceUsd: toOptionalNumber(row.min_price_usd),
    maxPriceUsd: toOptionalNumber(row.max_price_usd),
    reviewPrices,
    capacity: toOptionalNumber(row.capacity),
    averageRating: toOptionalNumber(row.average_rating),
    recommendationRate: toOptionalNumber(row.recommendation_rate),
    totalReviews: Number(row.total_reviews || 0),
    recentYear: row.recent_year || undefined,
    reviews: [],
  };
}

interface ReviewRow {
  id: string;
  source: "survey" | "web";
  year: number | null;
  rating: string | number | null;
  price_usd: string | number | null;
  recommended: boolean | null;
  comment: string | null;
  comment_en: string | null;
  comment_es: string | null;
  comment_fr: string | null;
  comment_de: string | null;
  comment_pt: string | null;
  comment_it: string | null;
  comment_no: string | null;
  allow_contact_sharing: boolean | null;
  student_contact: string | null;
  student_name: string | null;
  semester: string | null;
  created_at: string | Date;
}

function mapReviewRow(
  row: ReviewRow,
  lang: Lang,
  includeReviewerContactInfo: boolean,
): Review {
  const originalComment = row.comment || undefined;
  const translatedComment = getTranslatedCommentForLanguage(row, lang);

  return {
    id: row.id,
    source: row.source,
    year: row.year || undefined,
    rating: toOptionalNumber(row.rating),
    priceUsd: toOptionalNumber(row.price_usd),
    recommended: typeof row.recommended === "boolean" ? row.recommended : undefined,
    comment: translatedComment || originalComment,
    originalComment,
    translatedComment:
      translatedComment && translatedComment !== originalComment
        ? translatedComment
        : undefined,
    studentContact:
      includeReviewerContactInfo && row.allow_contact_sharing
        ? row.student_contact || undefined
        : undefined,
    studentName: row.student_name || undefined,
    semester: row.semester || undefined,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
  };
}

function applyPrivacy(
  listing: Listing,
  includeOwnerContactInfo: boolean,
  includeReviewerContactInfo: boolean,
): Listing {
  const reviewPrices = listing.reviews
    .map((review) => review.priceUsd)
    .filter((price): price is number => typeof price === "number");
  const minPriceFromReviews = reviewPrices.length ? Math.min(...reviewPrices) : undefined;
  const maxPriceFromReviews = reviewPrices.length ? Math.max(...reviewPrices) : undefined;

  return {
    ...listing,
    minPriceUsd: listing.minPriceUsd ?? minPriceFromReviews,
    maxPriceUsd: listing.maxPriceUsd ?? maxPriceFromReviews,
    contacts: includeOwnerContactInfo ? [...listing.contacts] : [],
    reviews: listing.reviews.map((review) => ({
      ...review,
      studentContact: includeReviewerContactInfo ? review.studentContact : undefined,
    })),
  };
}

export async function getListings(options: ListingPrivacyOptions = {}) {
  const { includeOwnerContactInfo, includeReviewerContactInfo } = resolvePrivacyOptions(options);
  const lang = options.lang ?? "en";

  const result = await dbQuery<ListingRow>(
    `
      SELECT
        l.id,
        l.address,
        l.neighborhood,
        l.latitude,
        l.longitude,
        COALESCE(array_agg(c.contact) FILTER (WHERE c.contact IS NOT NULL), '{}') AS contacts,
        l.price_usd,
        l.capacity,
        l.average_rating,
        l.recommendation_rate,
        l.total_reviews,
        l.recent_year,
        rp.min_price_usd,
        rp.max_price_usd,
        rp.review_prices
      FROM listings l
      LEFT JOIN listing_contacts c ON c.listing_id = l.id
      LEFT JOIN (
        SELECT
          listing_id,
          MIN(price_usd) AS min_price_usd,
          MAX(price_usd) AS max_price_usd,
          array_agg(price_usd ORDER BY price_usd ASC) AS review_prices
        FROM reviews
        WHERE status = 'approved'
          AND price_usd IS NOT NULL
        GROUP BY listing_id
      ) rp ON rp.listing_id = l.id
      GROUP BY l.id, rp.min_price_usd, rp.max_price_usd, rp.review_prices
      ORDER BY l.neighborhood ASC, l.address ASC
    `,
  );

  const listings = result.rows.map((row) => mapListingRow(row));
  const listingIds = listings.map((listing) => listing.id);

  if (listingIds.length > 0) {
    const reviewsResult = await dbQuery<(ReviewRow & { listing_id: string })>(
      `
        WITH ranked_reviews AS (
          SELECT
            listing_id,
            id,
            source,
            year,
            rating,
            price_usd,
            recommended,
            comment,
            comment_en,
            comment_es,
            comment_fr,
            comment_de,
            comment_pt,
            comment_it,
            comment_no,
            allow_contact_sharing,
            student_contact,
            student_name,
            semester,
            created_at,
            ROW_NUMBER() OVER (
              PARTITION BY listing_id
              ORDER BY created_at DESC, id DESC
            ) AS review_rank
          FROM reviews
          WHERE listing_id = ANY($1::text[])
            AND status = 'approved'
            AND comment IS NOT NULL
            AND btrim(comment) <> ''
        )
        SELECT
          listing_id,
          id,
          source,
          year,
          rating,
          price_usd,
          recommended,
          comment,
          comment_en,
          comment_es,
          comment_fr,
          comment_de,
          comment_pt,
          comment_it,
          comment_no,
          allow_contact_sharing,
          student_contact,
          student_name,
          semester,
          created_at
        FROM ranked_reviews
        WHERE review_rank <= 3
        ORDER BY listing_id ASC, created_at DESC, id DESC
      `,
      [listingIds],
    );

    const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
    for (const row of reviewsResult.rows) {
      const listing = listingsById.get(row.listing_id);
      if (!listing) {
        continue;
      }
      listing.reviews.push(mapReviewRow(row, lang, includeReviewerContactInfo));
    }
  }

  return listings.map((listing) =>
    applyPrivacy(listing, includeOwnerContactInfo, includeReviewerContactInfo),
  );
}

export async function getListingById(
  id: string,
  lang: Lang = "en",
  options: ListingPrivacyOptions = {},
): Promise<Listing | undefined> {
  const { includeOwnerContactInfo, includeReviewerContactInfo } = resolvePrivacyOptions(options);

  const listingResult = await dbQuery<ListingRow>(
    `
      SELECT
        l.id,
        l.address,
        l.neighborhood,
        l.latitude,
        l.longitude,
        COALESCE(array_agg(c.contact) FILTER (WHERE c.contact IS NOT NULL), '{}') AS contacts,
        l.price_usd,
        l.capacity,
        l.average_rating,
        l.recommendation_rate,
        l.total_reviews,
        l.recent_year,
        rp.min_price_usd,
        rp.max_price_usd,
        rp.review_prices
      FROM listings l
      LEFT JOIN listing_contacts c ON c.listing_id = l.id
      LEFT JOIN (
        SELECT
          listing_id,
          MIN(price_usd) AS min_price_usd,
          MAX(price_usd) AS max_price_usd,
          array_agg(price_usd ORDER BY price_usd ASC) AS review_prices
        FROM reviews
        WHERE status = 'approved'
          AND price_usd IS NOT NULL
        GROUP BY listing_id
      ) rp ON rp.listing_id = l.id
      WHERE l.id = $1
      GROUP BY l.id, rp.min_price_usd, rp.max_price_usd, rp.review_prices
    `,
    [id],
  );

  if (listingResult.rowCount === 0) {
    return undefined;
  }

  const reviewsResult = await dbQuery<ReviewRow>(
    `
      SELECT
        id,
        source,
        year,
        rating,
        price_usd,
        recommended,
        comment,
        comment_en,
        comment_es,
        comment_fr,
        comment_de,
        comment_pt,
        comment_it,
        comment_no,
        allow_contact_sharing,
        student_contact,
        student_name,
        semester,
        created_at
      FROM reviews
      WHERE listing_id = $1
        AND source = 'survey'
        AND status = 'approved'
      ORDER BY created_at DESC
    `,
    [id],
  );

  const listing = mapListingRow(listingResult.rows[0]);
  listing.reviews = reviewsResult.rows.map((row) =>
    mapReviewRow(row, lang, includeReviewerContactInfo),
  );
  return applyPrivacy(listing, includeOwnerContactInfo, includeReviewerContactInfo);
}

export interface NewListingInput {
  address: string;
  neighborhood: string;
  contacts: string[];
  priceUsd?: number;
  capacity?: number;
  latitude?: number;
  longitude?: number;
}

export async function createListing(input: NewListingInput) {
  return withTransaction(async (client) => {
    const slugBase = slugify(`${input.neighborhood}-${input.address}`);
    const hash = createHash("sha1")
      .update(`${input.neighborhood}|${input.address}|${randomUUID()}`)
      .digest("hex")
      .slice(0, 8);
    const listingId = `${slugBase || "listing"}-${hash}`;

    await client.query(
      `
        INSERT INTO listings (
          id,
          address,
          neighborhood,
          latitude,
          longitude,
          price_usd,
          capacity,
          average_rating,
          recommendation_rate,
          total_reviews,
          recent_year
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, 0, NULL)
      `,
      [
        listingId,
        input.address,
        input.neighborhood,
        input.latitude ?? null,
        input.longitude ?? null,
        input.priceUsd ?? null,
        input.capacity ?? null,
      ],
    );

    const uniqueContacts = [...new Set(input.contacts.map((contact) => contact.trim()))]
      .filter(Boolean)
      .slice(0, 20);

    for (const contact of uniqueContacts) {
      await client.query(
        `
          INSERT INTO listing_contacts (listing_id, contact)
          VALUES ($1, $2)
          ON CONFLICT (listing_id, contact) DO NOTHING
        `,
        [listingId, contact],
      );
    }

    await client.query(
      `
        UPDATE dataset_meta
        SET total_listings = (SELECT COUNT(*)::int FROM listings),
            updated_at = NOW()
        WHERE id = 1
      `,
    );

    return { ok: true as const, listingId };
  });
}

export async function getNeighborhoods() {
  const result = await dbQuery<{ neighborhood: string }>(
    `SELECT DISTINCT neighborhood FROM listings ORDER BY neighborhood ASC`,
  );
  return result.rows.map((row) => row.neighborhood);
}

export async function getDatasetMeta() {
  const result = await dbQuery<{
    generated_at: string | Date | null;
    source_file: string | null;
    total_listings: number | null;
  }>(
    `
      SELECT
        d.generated_at,
        d.source_file,
        (
          SELECT COUNT(*)::int
          FROM listings
        ) AS total_listings
      FROM dataset_meta d
      WHERE d.id = 1
    `,
  );

  if (result.rowCount === 0) {
    const listingCount = await dbQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM listings`,
    );
    return {
      generatedAt: new Date().toISOString(),
      sourceFile: "postgres",
      totalListings: Number(listingCount.rows[0]?.total || 0),
    };
  }

  const row = result.rows[0];
  return {
    generatedAt:
      typeof row.generated_at === "string"
        ? row.generated_at
        : row.generated_at?.toISOString() || new Date().toISOString(),
    sourceFile: row.source_file || "postgres",
    totalListings: Number(row.total_listings || 0),
  };
}

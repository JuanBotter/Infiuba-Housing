import datasetJson from "@/data/accommodations.json";
import { dbQuery, isDatabaseEnabled } from "@/lib/db";
import { getTranslatedCommentForLanguage } from "@/lib/review-translations";
import type { Dataset, Lang, Listing, Review } from "@/types";

const dataset = datasetJson as Dataset;

function toOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
}

function mapListingRow(row: ListingRow): Listing {
  return {
    id: row.id,
    address: row.address,
    neighborhood: row.neighborhood,
    latitude: toOptionalNumber(row.latitude),
    longitude: toOptionalNumber(row.longitude),
    contacts: row.contacts || [],
    priceUsd: toOptionalNumber(row.price_usd),
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
  recommended: boolean | null;
  comment: string | null;
  comment_en: string | null;
  comment_es: string | null;
  comment_fr: string | null;
  comment_de: string | null;
  comment_pt: string | null;
  comment_it: string | null;
  comment_no: string | null;
  student_contact: string | null;
  student_name: string | null;
  semester: string | null;
  created_at: string | Date;
}

function mapReviewRow(row: ReviewRow, lang: Lang): Review {
  const originalComment = row.comment || undefined;
  const translatedComment = getTranslatedCommentForLanguage(row, lang);

  return {
    id: row.id,
    source: row.source,
    year: row.year || undefined,
    rating: toOptionalNumber(row.rating),
    recommended: typeof row.recommended === "boolean" ? row.recommended : undefined,
    comment: translatedComment || originalComment,
    originalComment,
    translatedComment:
      translatedComment && translatedComment !== originalComment
        ? translatedComment
        : undefined,
    studentContact: row.student_contact || undefined,
    studentName: row.student_name || undefined,
    semester: row.semester || undefined,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
  };
}

export async function getListings() {
  if (!isDatabaseEnabled()) {
    return dataset.listings;
  }

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
        l.recent_year
      FROM listings l
      LEFT JOIN listing_contacts c ON c.listing_id = l.id
      GROUP BY l.id
      ORDER BY l.neighborhood ASC, l.address ASC
    `,
  );

  return result.rows.map(mapListingRow);
}

export async function getListingById(
  id: string,
  lang: Lang = "en",
): Promise<Listing | undefined> {
  if (!isDatabaseEnabled()) {
    return dataset.listings.find((listing) => listing.id === id);
  }

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
        l.recent_year
      FROM listings l
      LEFT JOIN listing_contacts c ON c.listing_id = l.id
      WHERE l.id = $1
      GROUP BY l.id
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
        recommended,
        comment,
        comment_en,
        comment_es,
        comment_fr,
        comment_de,
        comment_pt,
        comment_it,
        comment_no,
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
  listing.reviews = reviewsResult.rows.map((row) => mapReviewRow(row, lang));
  return listing;
}

export async function getNeighborhoods() {
  if (!isDatabaseEnabled()) {
    return [...new Set(dataset.listings.map((listing) => listing.neighborhood))].sort((a, b) =>
      a.localeCompare(b, "es"),
    );
  }

  const result = await dbQuery<{ neighborhood: string }>(
    `SELECT DISTINCT neighborhood FROM listings ORDER BY neighborhood ASC`,
  );
  return result.rows.map((row) => row.neighborhood);
}

export async function getDatasetMeta() {
  if (!isDatabaseEnabled()) {
    return {
      generatedAt: dataset.generatedAt,
      sourceFile: dataset.sourceFile,
      totalListings: dataset.totalListings,
    };
  }

  const result = await dbQuery<{
    generated_at: string | Date | null;
    source_file: string | null;
    total_listings: number | null;
  }>(
    `SELECT generated_at, source_file, total_listings FROM dataset_meta WHERE id = 1`,
  );

  if (result.rowCount === 0) {
    return {
      generatedAt: new Date().toISOString(),
      sourceFile: "postgres",
      totalListings: 0,
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

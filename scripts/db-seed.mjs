import { readFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";
import "./load-env.mjs";
import { resolvePgSslConfig } from "./pg-ssl.mjs";

const ROOT = process.cwd();
const DATASET_FILE = path.join(ROOT, "src", "data", "accommodations.json");
const PENDING_REVIEWS_FILE = path.join(ROOT, "data", "reviews.pending.json");
const APPROVED_REVIEWS_FILE = path.join(ROOT, "data", "reviews.approved.json");
const REVIEW_LANGUAGES = ["en", "es", "fr", "de", "pt", "it", "no"];
const REVIEW_TRANSLATION_COLUMNS = REVIEW_LANGUAGES.map((lang) => `comment_${lang}`);
const REVIEW_TRANSLATION_COLUMNS_SQL = REVIEW_TRANSLATION_COLUMNS.join(",\n          ");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed Postgres.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolvePgSslConfig(),
});

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeCreatedAt(value, fallback = "1970-01-01T00:00:00.000Z") {
  if (typeof value !== "string") {
    return fallback;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeTranslations(value) {
  const normalized = Object.fromEntries(
    REVIEW_TRANSLATION_COLUMNS.map((column) => [column, null]),
  );

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized;
  }

  for (const lang of REVIEW_LANGUAGES) {
    const column = `comment_${lang}`;
    const candidate = value[column] ?? value[lang];
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      normalized[column] = trimmed;
    }
  }

  return normalized;
}

function translationValues(translations) {
  return REVIEW_TRANSLATION_COLUMNS.map((column) => translations[column] ?? null);
}

function placeholders(startIndex, count) {
  return Array.from({ length: count }, (_, index) => `$${startIndex + index}`).join(", ");
}

const TRANSLATION_PLACEHOLDERS_FROM_12 = placeholders(12, REVIEW_TRANSLATION_COLUMNS.length);
const IMAGE_PLACEHOLDER_AFTER_TRANSLATIONS = `$${12 + REVIEW_TRANSLATION_COLUMNS.length}`;
const CREATED_AT_PLACEHOLDER_AFTER_TRANSLATIONS = `$${13 + REVIEW_TRANSLATION_COLUMNS.length}`;
const APPROVED_AT_PLACEHOLDER_AFTER_TRANSLATIONS = `$${14 + REVIEW_TRANSLATION_COLUMNS.length}`;

function normalizeImageUrls(value, maxCount) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxCount);
}

async function run() {
  const dataset = await readJson(DATASET_FILE, null);
  if (!dataset || !Array.isArray(dataset.listings)) {
    throw new Error(`Invalid dataset at ${DATASET_FILE}`);
  }

  const pendingWebReviews = await readJson(PENDING_REVIEWS_FILE, []);
  const approvedWebReviews = await readJson(APPROVED_REVIEWS_FILE, []);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingTranslationRows = await client.query(
      `
        SELECT
          id,
          ${REVIEW_TRANSLATION_COLUMNS_SQL}
        FROM reviews
      `,
    );
    const existingTranslations = new Map(
      existingTranslationRows.rows.map((row) => [
        row.id,
        normalizeTranslations(row),
      ]),
    );

    await client.query("TRUNCATE listing_contacts, reviews, listings RESTART IDENTITY CASCADE");

    await client.query(
      `
        INSERT INTO dataset_meta (id, generated_at, source_file, total_listings, updated_at)
        VALUES (1, $1, $2, $3, NOW())
        ON CONFLICT (id) DO UPDATE
          SET generated_at = EXCLUDED.generated_at,
              source_file = EXCLUDED.source_file,
              total_listings = EXCLUDED.total_listings,
              updated_at = NOW()
      `,
      [
        normalizeCreatedAt(dataset.generatedAt, new Date().toISOString()),
        dataset.sourceFile || "accommodations.json",
        dataset.totalListings || dataset.listings.length,
      ],
    );

    for (const listing of dataset.listings) {
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
            image_urls,
            average_rating,
            recommendation_rate,
            total_reviews,
            recent_year
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          listing.id,
          listing.address,
          listing.neighborhood,
          listing.latitude ?? null,
          listing.longitude ?? null,
          null,
          listing.capacity ?? null,
          normalizeImageUrls(listing.imageUrls, 12),
          listing.averageRating ?? null,
          listing.recommendationRate ?? null,
          listing.totalReviews ?? 0,
          listing.recentYear ?? null,
        ],
      );

      for (const contact of listing.contacts || []) {
        if (!contact) {
          continue;
        }
        await client.query(
          `
            INSERT INTO listing_contacts (listing_id, contact)
            VALUES ($1, $2)
            ON CONFLICT (listing_id, contact) DO NOTHING
          `,
          [listing.id, String(contact)],
        );
      }

      for (const review of listing.reviews || []) {
        const translations =
          existingTranslations.get(review.id) ||
          normalizeTranslations(review.commentTranslations);

        await client.query(
          `
            INSERT INTO reviews (
              id,
              listing_id,
              source,
              status,
              year,
              rating,
              price_usd,
              recommended,
              comment,
              student_contact,
              student_name,
              allow_contact_sharing,
              semester,
              ${REVIEW_TRANSLATION_COLUMNS_SQL},
              image_urls,
              created_at,
              approved_at
            ) VALUES ($1, $2, 'survey', 'approved', $3, $4, $5, $6, $7, $8, $9, $10, $11, ${TRANSLATION_PLACEHOLDERS_FROM_12}, ${IMAGE_PLACEHOLDER_AFTER_TRANSLATIONS}, ${CREATED_AT_PLACEHOLDER_AFTER_TRANSLATIONS}, ${CREATED_AT_PLACEHOLDER_AFTER_TRANSLATIONS})
            ON CONFLICT (id) DO NOTHING
          `,
          [
            review.id,
            listing.id,
            review.year ?? null,
            review.rating ?? null,
            review.priceUsd ?? null,
            typeof review.recommended === "boolean" ? review.recommended : null,
            review.comment ?? null,
            review.studentContact ?? null,
            review.studentName ?? null,
            Boolean(review.studentContact),
            review.semester ?? null,
            ...translationValues(translations),
            normalizeImageUrls(review.imageUrls, 6),
            normalizeCreatedAt(review.createdAt),
          ],
        );
      }
    }

    for (const review of approvedWebReviews) {
      const translations =
        existingTranslations.get(review.id) ||
        normalizeTranslations(review.commentTranslations);

      await client.query(
        `
          INSERT INTO reviews (
            id,
            listing_id,
            source,
            status,
            rating,
            price_usd,
            recommended,
            comment,
            semester,
            student_contact,
            student_name,
            student_email,
            allow_contact_sharing,
            ${REVIEW_TRANSLATION_COLUMNS_SQL},
            image_urls,
            created_at,
            approved_at
          ) VALUES ($1, $2, 'web', 'approved', $3, $4, $5, $6, $7, $8, $9, $10, $11, ${TRANSLATION_PLACEHOLDERS_FROM_12}, ${IMAGE_PLACEHOLDER_AFTER_TRANSLATIONS}, ${CREATED_AT_PLACEHOLDER_AFTER_TRANSLATIONS}, ${APPROVED_AT_PLACEHOLDER_AFTER_TRANSLATIONS})
          ON CONFLICT (id) DO NOTHING
        `,
        [
          review.id,
          review.listingId,
          review.rating ?? null,
          review.priceUsd ?? null,
          typeof review.recommended === "boolean" ? review.recommended : null,
          review.comment ?? null,
          review.semester ?? null,
          review.studentContact ?? null,
          review.studentName ?? null,
          review.studentEmail ?? null,
          Boolean(review.shareContactInfo),
          ...translationValues(translations),
          normalizeImageUrls(review.imageUrls, 6),
          normalizeCreatedAt(review.createdAt),
          normalizeCreatedAt(review.approvedAt, normalizeCreatedAt(review.createdAt)),
        ],
      );
    }

    for (const review of pendingWebReviews) {
      const translations =
        existingTranslations.get(review.id) ||
        normalizeTranslations(review.commentTranslations);

      await client.query(
        `
          INSERT INTO reviews (
            id,
            listing_id,
            source,
            status,
            rating,
            price_usd,
            recommended,
            comment,
            semester,
            student_contact,
            student_name,
            student_email,
            allow_contact_sharing,
            ${REVIEW_TRANSLATION_COLUMNS_SQL},
            image_urls,
            created_at
          ) VALUES ($1, $2, 'web', 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, ${TRANSLATION_PLACEHOLDERS_FROM_12}, ${IMAGE_PLACEHOLDER_AFTER_TRANSLATIONS}, ${CREATED_AT_PLACEHOLDER_AFTER_TRANSLATIONS})
          ON CONFLICT (id) DO NOTHING
        `,
        [
          review.id,
          review.listingId,
          review.rating ?? null,
          review.priceUsd ?? null,
          typeof review.recommended === "boolean" ? review.recommended : null,
          review.comment ?? null,
          review.semester ?? null,
          review.studentContact ?? null,
          review.studentName ?? null,
          review.studentEmail ?? null,
          Boolean(review.shareContactInfo),
          ...translationValues(translations),
          normalizeImageUrls(review.imageUrls, 6),
          normalizeCreatedAt(review.createdAt),
        ],
      );
    }

    await client.query("COMMIT");
    console.log(
      `Seeded Postgres with ${dataset.listings.length} listings, ${
        approvedWebReviews.length
      } approved web reviews, and ${pendingWebReviews.length} pending web reviews.`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

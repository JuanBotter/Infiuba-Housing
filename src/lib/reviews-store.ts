import { randomUUID } from "node:crypto";

import { unstable_cache } from "next/cache";

import { dbQuery, withTransaction } from "@/lib/db";
import { toOptionalNumber } from "@/lib/domain-constraints";
import {
  buildReviewTranslationSelectSql,
  getTranslatedCommentForLanguage,
  type ReviewTranslationColumns,
} from "@/lib/review-translations";
import type { AdminEditableReview, ApprovedWebReview, Lang, PendingWebReview } from "@/types";

function toIsoString(value: string | Date) {
  return typeof value === "string" ? value : value.toISOString();
}

function toOptionalText(value: string | null) {
  return value === null ? undefined : value;
}

function toOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length ? normalized : undefined;
}

interface ReviewRow extends ReviewTranslationColumns {
  id: string;
  listing_id: string;
  source?: "survey" | "web";
  status?: "pending" | "approved" | "rejected";
  year?: string | number | null;
  rating: string | number | null;
  price_usd: string | number | null;
  recommended: boolean | null;
  comment: string | null;
  semester: string | null;
  student_contact: string | null;
  student_name: string | null;
  student_email: string | null;
  allow_contact_sharing: boolean | null;
  image_urls: string[] | null;
  created_at: string | Date;
  approved_at: string | Date | null;
}

const REVIEW_TRANSLATION_COLUMNS_SQL = buildReviewTranslationSelectSql();
const REVIEW_TRANSLATION_COLUMNS_SQL_R = buildReviewTranslationSelectSql("r");

function mapPendingReviewRow(row: ReviewRow): PendingWebReview {
  return {
    id: row.id,
    listingId: row.listing_id,
    rating: toOptionalNumber(row.rating) || 0,
    priceUsd: toOptionalNumber(row.price_usd),
    recommended: Boolean(row.recommended),
    comment: row.comment || "",
    semester: toOptionalText(row.semester),
    studentName: toOptionalText(row.student_name),
    studentContact: toOptionalText(row.student_contact),
    studentEmail: toOptionalText(row.student_email),
    shareContactInfo: Boolean(row.allow_contact_sharing),
    imageUrls: toOptionalStringArray(row.image_urls),
    createdAt: toIsoString(row.created_at),
  };
}

function mapApprovedReviewRow(row: ReviewRow): ApprovedWebReview {
  return {
    ...mapPendingReviewRow(row),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : toIsoString(row.created_at),
  };
}

function mapAdminEditableReviewRow(row: ReviewRow): AdminEditableReview {
  const source = row.source === "survey" ? "survey" : "web";
  const status =
    row.status === "pending" || row.status === "rejected" || row.status === "approved"
      ? row.status
      : "approved";

  return {
    ...mapPendingReviewRow(row),
    source,
    status,
    year: toOptionalNumber(row.year),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : undefined,
  };
}

function mapApprovedReviewRowForLanguage(
  row: ReviewRow,
  lang: Lang,
  includePrivateContactInfo: boolean,
): ApprovedWebReview {
  const originalComment = row.comment || undefined;
  const translatedComment = getTranslatedCommentForLanguage(row, lang);

  return {
    ...mapApprovedReviewRow(row),
    comment: translatedComment || row.comment || "",
    originalComment,
    studentEmail: includePrivateContactInfo ? toOptionalText(row.student_email) : undefined,
    studentContact: includePrivateContactInfo && row.allow_contact_sharing
      ? toOptionalText(row.student_contact) || toOptionalText(row.student_email)
      : undefined,
    translatedComment:
      translatedComment && translatedComment !== originalComment
        ? translatedComment
        : undefined,
  };
}

interface ReviewPrivacyOptions {
  includePrivateContactInfo?: boolean;
}

const PUBLIC_REVIEW_CACHE_REVALIDATE_SECONDS = 300;

export async function getApprovedReviewsForListing(
  listingId: string,
  lang: Lang = "en",
  options: ReviewPrivacyOptions = {},
) {
  const includePrivateContactInfo = options.includePrivateContactInfo ?? true;

  const result = await dbQuery<ReviewRow>(
    `
      SELECT
        id,
        listing_id,
        rating,
        price_usd,
        recommended,
        comment,
        ${REVIEW_TRANSLATION_COLUMNS_SQL},
        semester,
        student_contact,
        student_name,
        student_email,
        allow_contact_sharing,
        image_urls,
        created_at,
        approved_at
      FROM reviews
      WHERE listing_id = $1
        AND source = 'web'
        AND status = 'approved'
      ORDER BY approved_at DESC NULLS LAST, created_at DESC
    `,
    [listingId],
  );
  return result.rows.map((row) =>
    mapApprovedReviewRowForLanguage(row, lang, includePrivateContactInfo),
  );
}

export async function getCachedPublicApprovedReviewsForListing(listingId: string, lang: Lang = "en") {
  return unstable_cache(
    async () =>
      getApprovedReviewsForListing(listingId, lang, {
        includePrivateContactInfo: false,
      }),
    [`public-approved-reviews:${listingId}:${lang}`],
    {
      revalidate: PUBLIC_REVIEW_CACHE_REVALIDATE_SECONDS,
      tags: [
        "public-approved-reviews",
        `public-approved-reviews:${listingId}`,
        `public-approved-reviews:${listingId}:${lang}`,
      ],
    },
  )();
}

export async function getPendingReviews() {
  const result = await dbQuery<ReviewRow>(
    `
      SELECT
        r.id,
        r.listing_id,
        r.rating,
        r.price_usd,
        r.recommended,
        r.comment,
        ${REVIEW_TRANSLATION_COLUMNS_SQL_R},
        r.semester,
        r.student_contact,
        r.student_name,
        r.student_email,
        r.allow_contact_sharing,
        r.image_urls,
        r.created_at,
        r.approved_at
      FROM reviews r
      WHERE r.source = 'web'
        AND r.status = 'pending'
      ORDER BY r.created_at DESC
    `,
  );
  return result.rows.map(mapPendingReviewRow);
}

export async function getApprovedReviews() {
  const result = await dbQuery<ReviewRow>(
    `
      SELECT
        id,
        listing_id,
        source,
        status,
        year,
        rating,
        price_usd,
        recommended,
        comment,
        ${REVIEW_TRANSLATION_COLUMNS_SQL},
        semester,
        student_contact,
        student_name,
        student_email,
        allow_contact_sharing,
        image_urls,
        created_at,
        approved_at
      FROM reviews
      WHERE status = 'approved'
      ORDER BY approved_at DESC NULLS LAST, created_at DESC
    `,
  );
  return result.rows.map(mapAdminEditableReviewRow);
}

export async function getApprovedReviewsPage(limit: number, offset: number) {
  const boundedLimit = Math.max(1, Math.floor(limit));
  const boundedOffset = Math.max(0, Math.floor(offset));

  const result = await dbQuery<ReviewRow>(
    `
      SELECT
        id,
        listing_id,
        source,
        status,
        year,
        rating,
        price_usd,
        recommended,
        comment,
        ${REVIEW_TRANSLATION_COLUMNS_SQL},
        semester,
        student_contact,
        student_name,
        student_email,
        allow_contact_sharing,
        image_urls,
        created_at,
        approved_at
      FROM reviews
      WHERE status = 'approved'
      ORDER BY approved_at DESC NULLS LAST, created_at DESC
      LIMIT $1
      OFFSET $2
    `,
    [boundedLimit, boundedOffset],
  );
  return result.rows.map(mapAdminEditableReviewRow);
}

export async function getApprovedReviewsTotal() {
  const result = await dbQuery<{ total: string | number }>(
    `
      SELECT COUNT(*) AS total
      FROM reviews
      WHERE status = 'approved'
    `,
  );
  const rawTotal = result.rows[0]?.total;
  const parsedTotal = typeof rawTotal === "number" ? rawTotal : Number(rawTotal);
  return Number.isFinite(parsedTotal) ? parsedTotal : 0;
}

async function refreshListingAggregates(client: {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}, listingId: string) {
  await client.query(
    `
      UPDATE listings
      SET
        average_rating = (
          SELECT AVG(rating)
          FROM reviews
          WHERE listing_id = $1
            AND status = 'approved'
            AND rating IS NOT NULL
        ),
        recommendation_rate = (
          SELECT CASE
            WHEN COUNT(*) FILTER (WHERE recommended IS NOT NULL) = 0 THEN NULL
            ELSE
              COUNT(*) FILTER (WHERE recommended = TRUE)::numeric
              / COUNT(*) FILTER (WHERE recommended IS NOT NULL)::numeric
          END
          FROM reviews
          WHERE listing_id = $1
            AND status = 'approved'
        ),
        total_reviews = (
          SELECT COUNT(*)::integer
          FROM reviews
          WHERE listing_id = $1
            AND status = 'approved'
        ),
        recent_year = (
          SELECT MAX(year)
          FROM reviews
          WHERE listing_id = $1
            AND status = 'approved'
            AND year IS NOT NULL
        ),
        updated_at = NOW()
      WHERE id = $1
    `,
    [listingId],
  );
}

export interface NewReviewInput {
  listingId: string;
  rating: number;
  priceUsd?: number;
  recommended: boolean;
  comment: string;
  semester?: string;
  studentName?: string;
  studentContact?: string;
  studentEmail?: string;
  shareContactInfo?: boolean;
  imageUrls?: string[];
}

export async function appendPendingReview(input: NewReviewInput) {
  const review: PendingWebReview = {
    id: `web-${randomUUID()}`,
    listingId: input.listingId,
    rating: input.rating,
    priceUsd: input.priceUsd,
    recommended: input.recommended,
    comment: input.comment,
    semester: input.semester || undefined,
    studentName: input.studentName || undefined,
    studentContact: input.studentContact || undefined,
    studentEmail: input.studentEmail || undefined,
    shareContactInfo: input.shareContactInfo || false,
    imageUrls: input.imageUrls?.length ? [...input.imageUrls] : undefined,
    createdAt: new Date().toISOString(),
  };

  await dbQuery(
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
        image_urls,
        created_at
      ) VALUES ($1, $2, 'web', 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      review.id,
      review.listingId,
      review.rating,
      review.priceUsd ?? null,
      review.recommended,
      review.comment,
      review.semester || null,
      review.studentContact || null,
      review.studentName || null,
      review.studentEmail || null,
      review.shareContactInfo || false,
      review.imageUrls || [],
      review.createdAt,
    ],
  );
  return review;
}

export async function moderatePendingReview(
  reviewId: string,
  action: "approve" | "reject",
) {
  return withTransaction(async (client) => {
    const selected = await client.query<ReviewRow>(
      `
        SELECT
          id,
          listing_id,
          rating,
          price_usd,
          recommended,
          comment,
          ${REVIEW_TRANSLATION_COLUMNS_SQL},
          semester,
          student_contact,
          student_name,
          student_email,
          allow_contact_sharing,
          image_urls,
          created_at,
          approved_at
        FROM reviews
        WHERE id = $1
          AND source = 'web'
          AND status = 'pending'
        FOR UPDATE
      `,
      [reviewId],
    );

    if (selected.rowCount === 0) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const reviewRow = selected.rows[0];

    if (action === "approve") {
      await client.query(
        `
          UPDATE reviews
          SET status = 'approved',
              approved_at = NOW()
          WHERE id = $1
        `,
        [reviewId],
      );

      await refreshListingAggregates(client, reviewRow.listing_id);

      const approved = await client.query<ReviewRow>(
        `
          SELECT
            id,
            listing_id,
            rating,
            price_usd,
            recommended,
            comment,
            ${REVIEW_TRANSLATION_COLUMNS_SQL},
            semester,
            student_contact,
            student_name,
            student_email,
            allow_contact_sharing,
            image_urls,
            created_at,
            approved_at
          FROM reviews
          WHERE id = $1
        `,
        [reviewId],
      );

      return {
        ok: true as const,
        action: "approve" as const,
        review: mapApprovedReviewRow(approved.rows[0]),
      };
    }

    await client.query(
      `
        UPDATE reviews
        SET status = 'rejected',
            approved_at = NULL
        WHERE id = $1
      `,
      [reviewId],
    );

    return {
      ok: true as const,
      action: "reject" as const,
      review: mapPendingReviewRow(reviewRow),
    };
  });
}

export interface AdminReviewUpdateInput {
  rating?: number;
  priceUsd?: number;
  recommended?: boolean;
  comment?: string;
  semester?: string;
  year?: number;
  studentName?: string;
  studentContact?: string;
  studentEmail?: string;
  shareContactInfo?: boolean;
  imageUrls: string[];
}

export async function updateReviewByAdmin(reviewId: string, input: AdminReviewUpdateInput) {
  return withTransaction(async (client) => {
    const selected = await client.query<ReviewRow>(
      `
        SELECT
          id,
          listing_id,
          source,
          status,
          year,
          rating,
          price_usd,
          recommended,
          comment,
          ${REVIEW_TRANSLATION_COLUMNS_SQL},
          semester,
          student_contact,
          student_name,
          student_email,
          allow_contact_sharing,
          image_urls,
          created_at,
          approved_at
        FROM reviews
        WHERE id = $1
          AND status = 'approved'
        FOR UPDATE
      `,
      [reviewId],
    );

    if (selected.rowCount === 0) {
      return { ok: false as const, reason: "not_found" as const };
    }

    const existing = selected.rows[0];
    const nextStudentName = input.studentName ?? toOptionalText(existing.student_name);
    const nextStudentContact = input.studentContact ?? toOptionalText(existing.student_contact);
    const nextStudentEmail = input.studentEmail ?? toOptionalText(existing.student_email);
    const nextRating = input.rating ?? toOptionalNumber(existing.rating);
    const nextRecommended =
      typeof input.recommended === "boolean"
        ? input.recommended
        : existing.recommended === null
          ? null
          : Boolean(existing.recommended);
    const nextComment = input.comment ?? existing.comment ?? "";
    const nextShareContactInfo =
      typeof input.shareContactInfo === "boolean"
        ? input.shareContactInfo
        : Boolean(existing.allow_contact_sharing);
    const nextPriceUsd = input.priceUsd ?? toOptionalNumber(existing.price_usd);
    const nextSemester = input.semester ?? toOptionalText(existing.semester);
    const nextYear = input.year ?? toOptionalNumber(existing.year);

    await client.query(
      `
        UPDATE reviews
        SET rating = $2,
            price_usd = $3,
            recommended = $4,
            comment = $5,
            semester = $6,
            year = $7,
            student_name = $8,
            student_contact = $9,
            student_email = $10,
            allow_contact_sharing = $11,
            image_urls = $12::text[]
        WHERE id = $1
      `,
      [
        reviewId,
        nextRating ?? null,
        nextPriceUsd ?? null,
        nextRecommended,
        nextComment,
        nextSemester ?? null,
        nextYear ?? null,
        nextStudentName ?? null,
        nextStudentContact ?? null,
        nextStudentEmail ?? null,
        nextShareContactInfo,
        input.imageUrls,
      ],
    );

    await refreshListingAggregates(client, existing.listing_id);

    const updated = await client.query<ReviewRow>(
      `
        SELECT
          id,
          listing_id,
          source,
          status,
          year,
          rating,
          price_usd,
          recommended,
          comment,
          ${REVIEW_TRANSLATION_COLUMNS_SQL},
          semester,
          student_contact,
          student_name,
          student_email,
          allow_contact_sharing,
          image_urls,
          created_at,
          approved_at
        FROM reviews
        WHERE id = $1
      `,
      [reviewId],
    );

    return {
      ok: true as const,
      review: mapAdminEditableReviewRow(updated.rows[0]),
    };
  });
}

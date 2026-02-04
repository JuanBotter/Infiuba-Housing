import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { dbQuery, isDatabaseEnabled, withTransaction } from "@/lib/db";
import { getTranslatedCommentForLanguage } from "@/lib/review-translations";
import type { ApprovedWebReview, Lang, PendingWebReview } from "@/types";

const PENDING_FILE = path.join(process.cwd(), "data", "reviews.pending.json");
const APPROVED_FILE = path.join(process.cwd(), "data", "reviews.approved.json");

async function readArrayFile<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeArrayFile<T>(filePath: string, values: T[]) {
  await writeFile(filePath, `${JSON.stringify(values, null, 2)}\n`, "utf8");
}

function toIsoString(value: string | Date) {
  return typeof value === "string" ? value : value.toISOString();
}

function toOptionalText(value: string | null) {
  return value === null ? undefined : value;
}

function toOptionalNumber(value: string | number | null) {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface ReviewRow {
  id: string;
  listing_id: string;
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
  semester: string | null;
  student_contact: string | null;
  student_name: string | null;
  student_email: string | null;
  allow_contact_sharing: boolean | null;
  created_at: string | Date;
  approved_at: string | Date | null;
}

function mapPendingReviewRow(row: ReviewRow): PendingWebReview {
  return {
    id: row.id,
    listingId: row.listing_id,
    rating: toOptionalNumber(row.rating) || 0,
    recommended: Boolean(row.recommended),
    comment: row.comment || "",
    semester: toOptionalText(row.semester),
    studentName: toOptionalText(row.student_name),
    studentContact: toOptionalText(row.student_contact),
    studentEmail: toOptionalText(row.student_email),
    shareContactInfo: Boolean(row.allow_contact_sharing),
    createdAt: toIsoString(row.created_at),
  };
}

function mapApprovedReviewRow(row: ReviewRow): ApprovedWebReview {
  return {
    ...mapPendingReviewRow(row),
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : toIsoString(row.created_at),
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

export async function getApprovedReviewsForListing(
  listingId: string,
  lang: Lang = "en",
  options: ReviewPrivacyOptions = {},
) {
  const includePrivateContactInfo = options.includePrivateContactInfo ?? true;

  if (isDatabaseEnabled()) {
    const result = await dbQuery<ReviewRow>(
      `
        SELECT
          id,
          listing_id,
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
          semester,
          student_contact,
          student_name,
          student_email,
          allow_contact_sharing,
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

  const approved = await readArrayFile<ApprovedWebReview>(APPROVED_FILE);
  return approved
    .filter((review) => review.listingId === listingId)
    .map((review) => ({
      ...review,
      studentEmail: includePrivateContactInfo ? review.studentEmail : undefined,
      studentContact: includePrivateContactInfo ? review.studentContact : undefined,
    }));
}

export async function getPendingReviews() {
  if (isDatabaseEnabled()) {
    const result = await dbQuery<ReviewRow>(
      `
        SELECT
          id,
          listing_id,
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
          semester,
          student_contact,
          student_name,
          student_email,
          allow_contact_sharing,
          created_at,
          approved_at
        FROM reviews
        WHERE source = 'web'
          AND status = 'pending'
        ORDER BY created_at DESC
      `,
    );
    return result.rows.map(mapPendingReviewRow);
  }

  return readArrayFile<PendingWebReview>(PENDING_FILE);
}

export async function getApprovedReviews() {
  if (isDatabaseEnabled()) {
    const result = await dbQuery<ReviewRow>(
      `
        SELECT
          id,
          listing_id,
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
          semester,
          student_contact,
          student_name,
          student_email,
          allow_contact_sharing,
          created_at,
          approved_at
        FROM reviews
        WHERE source = 'web'
          AND status = 'approved'
        ORDER BY approved_at DESC NULLS LAST, created_at DESC
      `,
    );
    return result.rows.map(mapApprovedReviewRow);
  }

  return readArrayFile<ApprovedWebReview>(APPROVED_FILE);
}

export interface NewReviewInput {
  listingId: string;
  rating: number;
  recommended: boolean;
  comment: string;
  semester?: string;
  studentName?: string;
  studentContact?: string;
  studentEmail?: string;
  shareContactInfo?: boolean;
}

export async function appendPendingReview(input: NewReviewInput) {
  if (isDatabaseEnabled()) {
    const review: PendingWebReview = {
      id: `web-${randomUUID()}`,
      listingId: input.listingId,
      rating: input.rating,
      recommended: input.recommended,
      comment: input.comment,
      semester: input.semester || undefined,
      studentName: input.studentName || undefined,
      studentContact: input.studentContact || undefined,
      studentEmail: input.studentEmail || undefined,
      shareContactInfo: input.shareContactInfo || false,
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
          recommended,
          comment,
          semester,
          student_contact,
          student_name,
          student_email,
          allow_contact_sharing,
          created_at
        ) VALUES ($1, $2, 'web', 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        review.id,
        review.listingId,
        review.rating,
        review.recommended,
        review.comment,
        review.semester || null,
        review.studentContact || null,
        review.studentName || null,
        review.studentEmail || null,
        review.shareContactInfo || false,
        review.createdAt,
      ],
    );
    return review;
  }

  const pending = await readArrayFile<PendingWebReview>(PENDING_FILE);

  const review: PendingWebReview = {
    id: `web-${randomUUID()}`,
    listingId: input.listingId,
    rating: input.rating,
    recommended: input.recommended,
    comment: input.comment,
    semester: input.semester || undefined,
    studentName: input.studentName || undefined,
    studentContact: input.studentContact || undefined,
    studentEmail: input.studentEmail || undefined,
    shareContactInfo: input.shareContactInfo || false,
    createdAt: new Date().toISOString(),
  };

  pending.push(review);
  await writeArrayFile(PENDING_FILE, pending);
  return review;
}

export async function moderatePendingReview(
  reviewId: string,
  action: "approve" | "reject",
) {
  if (isDatabaseEnabled()) {
    return withTransaction(async (client) => {
      const selected = await client.query<ReviewRow>(
        `
          SELECT
            id,
            listing_id,
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
            semester,
            student_contact,
            student_name,
            student_email,
            allow_contact_sharing,
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

        const approved = await client.query<ReviewRow>(
          `
            SELECT
              id,
              listing_id,
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
              semester,
              student_contact,
              student_name,
              student_email,
              allow_contact_sharing,
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

  const pending = await readArrayFile<PendingWebReview>(PENDING_FILE);
  const reviewIndex = pending.findIndex((review) => review.id === reviewId);
  if (reviewIndex < 0) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const [review] = pending.splice(reviewIndex, 1);
  await writeArrayFile(PENDING_FILE, pending);

  if (action === "approve") {
    const approved = await readArrayFile<ApprovedWebReview>(APPROVED_FILE);
    const approvedReview: ApprovedWebReview = {
      ...review,
      approvedAt: new Date().toISOString(),
    };
    approved.push(approvedReview);
    await writeArrayFile(APPROVED_FILE, approved);
    return { ok: true as const, action: "approve" as const, review: approvedReview };
  }

  return { ok: true as const, action: "reject" as const, review };
}

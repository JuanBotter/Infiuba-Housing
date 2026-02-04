import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ApprovedWebReview, PendingWebReview } from "@/types";

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

export async function getApprovedReviewsForListing(listingId: string) {
  const approved = await readArrayFile<ApprovedWebReview>(APPROVED_FILE);
  return approved.filter((review) => review.listingId === listingId);
}

export async function getPendingReviews() {
  return readArrayFile<PendingWebReview>(PENDING_FILE);
}

export async function getApprovedReviews() {
  return readArrayFile<ApprovedWebReview>(APPROVED_FILE);
}

export interface NewReviewInput {
  listingId: string;
  rating: number;
  recommended: boolean;
  comment: string;
  semester?: string;
  studentName?: string;
  studentEmail?: string;
}

export async function appendPendingReview(input: NewReviewInput) {
  const pending = await readArrayFile<PendingWebReview>(PENDING_FILE);

  const review: PendingWebReview = {
    id: `web-${randomUUID()}`,
    listingId: input.listingId,
    rating: input.rating,
    recommended: input.recommended,
    comment: input.comment,
    semester: input.semester || undefined,
    studentName: input.studentName || undefined,
    studentEmail: input.studentEmail || undefined,
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

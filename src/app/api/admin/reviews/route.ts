import { requireAdminSession, requireSameOrigin } from "@/lib/api-route-helpers";
import { revalidatePublicListingWithApprovedReviews } from "@/lib/cache-tags";
import { normalizeReviewerContactFields } from "@/lib/domain-constraints";
import { jsonNoStore } from "@/lib/http-cache";
import { asObject, parseEnum, parseOptionalNumber, parseString } from "@/lib/request-validation";
import { parseReviewImageUrls } from "@/lib/review-images";
import {
  getApprovedReviewsPage,
  getApprovedReviewsTotal,
  getPendingReviews,
  moderatePendingReview,
  updateReviewByAdmin,
} from "@/lib/reviews-store";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

export async function GET(request: Request) {
  const adminSessionResult = await requireAdminSession(request);
  if (!adminSessionResult.ok) {
    return adminSessionResult.response;
  }

  const searchParams = new URL(request.url).searchParams;
  const approvedLimitRaw = Number(searchParams.get("approvedLimit"));
  const approvedOffsetRaw = Number(searchParams.get("approvedOffset"));
  const approvedLimit = Number.isFinite(approvedLimitRaw)
    ? Math.max(1, Math.min(100, Math.floor(approvedLimitRaw)))
    : 30;
  const approvedOffset = Number.isFinite(approvedOffsetRaw)
    ? Math.max(0, Math.floor(approvedOffsetRaw))
    : 0;

  const [pending, approved, approvedTotal] = await Promise.all([
    getPendingReviews(),
    getApprovedReviewsPage(approvedLimit, approvedOffset),
    getApprovedReviewsTotal(),
  ]);
  pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return jsonNoStore({
    pending,
    approved,
    approvedTotal,
    approvedLimit,
    approvedOffset,
  });
}

export async function POST(request: Request) {
  const sameOriginResponse = requireSameOrigin(request, { noStore: true });
  if (sameOriginResponse) {
    return sameOriginResponse;
  }

  const adminSessionResult = await requireAdminSession(request);
  if (!adminSessionResult.ok) {
    return adminSessionResult.response;
  }
  const { session } = adminSessionResult;

  const payload = asObject(await request.json().catch(() => null));
  const action = parseEnum(payload?.action, ["approve", "reject", "edit"] as const);
  const reviewId = parseString(payload?.reviewId, { maxLength: 180 });

  if (!action || !reviewId) {
    await recordSecurityAuditEvent({
      eventType: "admin.review.moderate",
      outcome: "invalid_request",
      actorEmail: session.email,
      metadata: {
        action: action || null,
      },
    });
    return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
  }

  if (action === "edit") {
    const hasRating =
      payload !== null &&
      typeof payload === "object" &&
      Object.prototype.hasOwnProperty.call(payload, "rating");
    const rating = hasRating ? Number(payload?.rating) : undefined;
    const hasRecommended =
      payload !== null &&
      typeof payload === "object" &&
      Object.prototype.hasOwnProperty.call(payload, "recommended");
    const recommended = hasRecommended ? payload?.recommended : undefined;
    const hasComment =
      payload !== null &&
      typeof payload === "object" &&
      Object.prototype.hasOwnProperty.call(payload, "comment");
    const comment = parseString(payload?.comment, { maxLength: 1000 });
    const semester = parseString(payload?.semester, { maxLength: 60 });
    const yearRaw = parseString(payload?.year, { maxLength: 10 });
    const year = yearRaw ? Number(yearRaw) : undefined;
    const submittedPriceUsd = parseOptionalNumber(payload?.priceUsd);
    const studentName = parseString(payload?.studentName, { maxLength: 80 });
    let studentContact = parseString(payload?.studentContact, { maxLength: 120 });
    let studentEmail = parseString(payload?.studentEmail, { maxLength: 120 });
    const shareContactInfo =
      typeof payload?.shareContactInfo === "boolean" ? payload.shareContactInfo : undefined;
    const parsedReviewImageUrls = parseReviewImageUrls(payload?.reviewImageUrls);

    const invalidYear =
      year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 2100);

    if (
      (rating !== undefined && (!Number.isFinite(rating) || rating < 1 || rating > 5)) ||
      (hasRecommended && typeof recommended !== "boolean") ||
      (hasComment && !comment) ||
      invalidYear ||
      (submittedPriceUsd !== undefined && (submittedPriceUsd <= 0 || submittedPriceUsd > 20000)) ||
      !parsedReviewImageUrls.ok
    ) {
      await recordSecurityAuditEvent({
        eventType: "admin.review.edit",
        outcome: "invalid_request",
        actorEmail: session.email,
        metadata: { reviewId },
      });
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }

    const normalizedContactFields = normalizeReviewerContactFields(studentEmail, studentContact);
    if (!normalizedContactFields.ok) {
      await recordSecurityAuditEvent({
        eventType: "admin.review.edit",
        outcome: "invalid_request",
        actorEmail: session.email,
        metadata: { reviewId },
      });
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }

    studentEmail = normalizedContactFields.studentEmail;
    studentContact = normalizedContactFields.studentContact;
    if (shareContactInfo === true && !studentEmail && !studentContact) {
      await recordSecurityAuditEvent({
        eventType: "admin.review.edit",
        outcome: "invalid_request",
        actorEmail: session.email,
        metadata: { reviewId },
      });
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }

    const result = await updateReviewByAdmin(reviewId, {
      rating,
      recommended: typeof recommended === "boolean" ? recommended : undefined,
      comment: hasComment ? comment : undefined,
      priceUsd: submittedPriceUsd,
      semester: semester || undefined,
      year,
      studentName: studentName || undefined,
      studentContact: studentContact || undefined,
      studentEmail: studentEmail || undefined,
      shareContactInfo,
      imageUrls: parsedReviewImageUrls.urls,
    });

    if (!result.ok) {
      await recordSecurityAuditEvent({
        eventType: "admin.review.edit",
        outcome: result.reason,
        actorEmail: session.email,
        metadata: {
          reviewId,
        },
      });
      return jsonNoStore({ error: "Review not found" }, { status: 404 });
    }

    await recordSecurityAuditEvent({
      eventType: "admin.review.edit",
      outcome: "ok",
      actorEmail: session.email,
      metadata: {
        reviewId,
        listingId: result.review.listingId,
        source: result.review.source,
      },
    });

    revalidatePublicListingWithApprovedReviews(result.review.listingId);

    return jsonNoStore({ ok: true, action, reviewId });
  }

  const result = await moderatePendingReview(reviewId, action);
  if (!result.ok) {
    await recordSecurityAuditEvent({
      eventType: "admin.review.moderate",
      outcome: result.reason,
      actorEmail: session.email,
      metadata: {
        action,
        reviewId,
      },
    });
    return jsonNoStore({ error: "Review not found" }, { status: 404 });
  }

  await recordSecurityAuditEvent({
    eventType: "admin.review.moderate",
    outcome: "ok",
    actorEmail: session.email,
    metadata: {
      action: result.action,
      reviewId,
      listingId: result.review.listingId,
    },
  });

  if (result.action === "approve") {
    revalidatePublicListingWithApprovedReviews(result.review.listingId);
  }

  return jsonNoStore({ ok: true, action: result.action, reviewId });
}

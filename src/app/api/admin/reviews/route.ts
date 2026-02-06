import { revalidateTag } from "next/cache";

import { canAccessAdmin, getAuthSessionFromRequest, getRoleFromRequestAsync } from "@/lib/auth";
import { jsonNoStore, withNoStore } from "@/lib/http-cache";
import { validateSameOriginRequest } from "@/lib/request-origin";
import { asObject, parseEnum, parseString } from "@/lib/request-validation";
import {
  getApprovedReviews,
  getPendingReviews,
  moderatePendingReview,
} from "@/lib/reviews-store";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

export async function GET(request: Request) {
  if (!canAccessAdmin(await getRoleFromRequestAsync(request))) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  const [pending, approved] = await Promise.all([getPendingReviews(), getApprovedReviews()]);
  pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  approved.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));

  return jsonNoStore({ pending, approved });
}

export async function POST(request: Request) {
  const originValidation = validateSameOriginRequest(request);
  if (!originValidation.ok) {
    return withNoStore(originValidation.response);
  }

  const session = await getAuthSessionFromRequest(request);
  if (!canAccessAdmin(session.role)) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = asObject(await request.json().catch(() => null));
  const action = parseEnum(payload?.action, ["approve", "reject"] as const);
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
    revalidateTag("public-listings", "max");
    revalidateTag(`public-listing:${result.review.listingId}`, "max");
    revalidateTag("public-approved-reviews", "max");
    revalidateTag(`public-approved-reviews:${result.review.listingId}`, "max");
  }

  return jsonNoStore({ ok: true, action: result.action, reviewId });
}

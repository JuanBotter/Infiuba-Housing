import { requireAdminSession, requireSameOrigin } from "@/lib/api-route-helpers";
import { revalidatePublicListingWithApprovedReviews } from "@/lib/cache-tags";
import { jsonNoStore } from "@/lib/http-cache";
import { asObject, parseEnum, parseString } from "@/lib/request-validation";
import {
  getApprovedReviews,
  getPendingReviews,
  moderatePendingReview,
} from "@/lib/reviews-store";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

export async function GET(request: Request) {
  const adminSessionResult = await requireAdminSession(request);
  if (!adminSessionResult.ok) {
    return adminSessionResult.response;
  }

  const [pending, approved] = await Promise.all([getPendingReviews(), getApprovedReviews()]);
  pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  approved.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));

  return jsonNoStore({ pending, approved });
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
    revalidatePublicListingWithApprovedReviews(result.review.listingId);
  }

  return jsonNoStore({ ok: true, action: result.action, reviewId });
}

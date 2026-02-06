import { canAccessAdmin, getRoleFromRequestAsync } from "@/lib/auth";
import { jsonNoStore, withNoStore } from "@/lib/http-cache";
import { validateSameOriginRequest } from "@/lib/request-origin";
import {
  getApprovedReviews,
  getPendingReviews,
  moderatePendingReview,
} from "@/lib/reviews-store";

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

  if (!canAccessAdmin(await getRoleFromRequestAsync(request))) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const action = payload?.action;
  const reviewId = typeof payload?.reviewId === "string" ? payload.reviewId.trim() : "";

  if ((action !== "approve" && action !== "reject") || !reviewId) {
    return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await moderatePendingReview(reviewId, action);
  if (!result.ok) {
    return jsonNoStore({ error: "Review not found" }, { status: 404 });
  }

  return jsonNoStore({ ok: true, action: result.action, reviewId });
}

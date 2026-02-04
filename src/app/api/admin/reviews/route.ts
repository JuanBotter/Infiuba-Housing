import { NextResponse } from "next/server";

import {
  getApprovedReviews,
  getPendingReviews,
  moderatePendingReview,
} from "@/lib/reviews-store";

function isAuthorized(request: Request) {
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) {
    return true;
  }

  const providedToken = request.headers.get("x-admin-token")?.trim();
  return Boolean(providedToken && providedToken === expectedToken);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [pending, approved] = await Promise.all([getPendingReviews(), getApprovedReviews()]);
  pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  approved.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));

  return NextResponse.json({ pending, approved });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const action = payload?.action;
  const reviewId = typeof payload?.reviewId === "string" ? payload.reviewId.trim() : "";

  if ((action !== "approve" && action !== "reject") || !reviewId) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await moderatePendingReview(reviewId, action);
  if (!result.ok) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, action: result.action, reviewId });
}

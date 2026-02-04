import { NextResponse } from "next/server";

import { canAccessAdmin, getRoleFromRequest } from "@/lib/auth";
import {
  getApprovedReviews,
  getPendingReviews,
  moderatePendingReview,
} from "@/lib/reviews-store";

export async function GET(request: Request) {
  if (!canAccessAdmin(getRoleFromRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [pending, approved] = await Promise.all([getPendingReviews(), getApprovedReviews()]);
  pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  approved.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));

  return NextResponse.json({ pending, approved });
}

export async function POST(request: Request) {
  if (!canAccessAdmin(getRoleFromRequest(request))) {
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

import { NextResponse } from "next/server";

import { getListingById } from "@/lib/data";
import { appendPendingReview } from "@/lib/reviews-store";

function truncate(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const listingId = truncate(payload?.listingId, 200);
    const comment = truncate(payload?.comment, 1000);
    const semester = truncate(payload?.semester, 60);
    const studentName = truncate(payload?.studentName, 80);
    const studentEmail = truncate(payload?.studentEmail, 120);

    const rating = Number(payload?.rating);
    const recommended = payload?.recommended;

    const listing = listingId ? await getListingById(listingId) : undefined;
    if (!listingId || !listing) {
      return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }
    if (typeof recommended !== "boolean") {
      return NextResponse.json({ error: "Invalid recommendation value" }, { status: 400 });
    }
    if (comment.length < 12) {
      return NextResponse.json({ error: "Comment is too short" }, { status: 400 });
    }

    await appendPendingReview({
      listingId,
      rating,
      recommended,
      comment,
      semester: semester || undefined,
      studentName: studentName || undefined,
      studentEmail: studentEmail || undefined,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create review" }, { status: 500 });
  }
}

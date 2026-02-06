import { NextResponse } from "next/server";

import { canSubmitReviews, getRoleFromRequestAsync } from "@/lib/auth";
import { createListing, getListingById } from "@/lib/data";
import { validateSameOriginRequest } from "@/lib/request-origin";
import { appendPendingReview } from "@/lib/reviews-store";

const MAX_NEW_LISTING_CONTACTS = 20;
const MAX_NEW_LISTING_CONTACT_LENGTH = 180;

function truncate(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function parseOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseContacts(value: unknown) {
  if (typeof value !== "string") {
    return { contacts: [], hasContactTooLong: false };
  }

  const parsedContacts = value
    .split(/\r?\n|,|;/g)
    .map((item) => item.trim())
    .filter(Boolean);

  const hasContactTooLong = parsedContacts.some((item) => item.length > MAX_NEW_LISTING_CONTACT_LENGTH);
  return {
    contacts: [...new Set(parsedContacts)].slice(0, MAX_NEW_LISTING_CONTACTS),
    hasContactTooLong,
  };
}

export async function POST(request: Request) {
  try {
    const originValidation = validateSameOriginRequest(request);
    if (!originValidation.ok) {
      return originValidation.response;
    }

    const role = await getRoleFromRequestAsync(request);
    if (!canSubmitReviews(role)) {
      return NextResponse.json(
        { error: "Only whitelisted students can submit reviews." },
        { status: 403 },
      );
    }

    const payload = await request.json();
    const listingId = truncate(payload?.listingId, 200);
    const comment = truncate(payload?.comment, 1000);
    const semester = truncate(payload?.semester, 60);
    const studentName = truncate(payload?.studentName, 80);
    const studentContact = truncate(payload?.studentContact, 120);
    const studentEmail = truncate(payload?.studentEmail, 120);
    const shareContactInfo = payload?.shareContactInfo === true;
    const submittedPriceUsd = parseOptionalNumber(payload?.priceUsd);

    const rating = Number(payload?.rating);
    const recommended = payload?.recommended;
    const confirmExistingDetails = payload?.confirmExistingDetails;

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }
    if (typeof recommended !== "boolean") {
      return NextResponse.json({ error: "Invalid recommendation value" }, { status: 400 });
    }
    if (comment.length < 12) {
      return NextResponse.json({ error: "Comment is too short" }, { status: 400 });
    }
    if (submittedPriceUsd !== undefined && (submittedPriceUsd <= 0 || submittedPriceUsd > 20000)) {
      return NextResponse.json({ error: "Invalid rent value" }, { status: 400 });
    }
    if (shareContactInfo && !studentEmail && !studentContact) {
      return NextResponse.json(
        { error: "Add an email or phone number to share contact info" },
        { status: 400 },
      );
    }

    let resolvedListingId = listingId;
    if (listingId) {
      const listing = await getListingById(listingId);
      if (!listing) {
        return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });
      }

      // Backwards compatibility for detail page review form.
      const isLegacyPayload =
        payload?.confirmExistingDetails === undefined &&
        payload?.address === undefined &&
        payload?.neighborhood === undefined;

      if (!isLegacyPayload && confirmExistingDetails !== true) {
        return NextResponse.json(
          { error: "Please confirm property details for existing listings" },
          { status: 400 },
        );
      }
    } else {
      const address = truncate(payload?.address, 180);
      const neighborhood = truncate(payload?.neighborhood, 80);
      const { contacts, hasContactTooLong } = parseContacts(payload?.contacts);
      const priceUsd = submittedPriceUsd;
      const capacity = parseOptionalNumber(payload?.capacity);
      const latitude = parseOptionalNumber(payload?.latitude);
      const longitude = parseOptionalNumber(payload?.longitude);

      if (address.length < 6) {
        return NextResponse.json({ error: "Invalid address" }, { status: 400 });
      }
      if (neighborhood.length < 2) {
        return NextResponse.json({ error: "Invalid neighborhood" }, { status: 400 });
      }
      if (hasContactTooLong) {
        return NextResponse.json(
          {
            error: `Each contact must be at most ${MAX_NEW_LISTING_CONTACT_LENGTH} characters`,
          },
          { status: 400 },
        );
      }
      if (capacity !== undefined && (capacity <= 0 || capacity > 50)) {
        return NextResponse.json({ error: "Invalid capacity value" }, { status: 400 });
      }

      const latitudeProvided = latitude !== undefined;
      const longitudeProvided = longitude !== undefined;
      if (latitudeProvided !== longitudeProvided) {
        return NextResponse.json(
          { error: "Latitude and longitude must be provided together" },
          { status: 400 },
        );
      }
      if (latitudeProvided && (latitude < -90 || latitude > 90)) {
        return NextResponse.json({ error: "Invalid latitude" }, { status: 400 });
      }
      if (longitudeProvided && (longitude < -180 || longitude > 180)) {
        return NextResponse.json({ error: "Invalid longitude" }, { status: 400 });
      }

      const created = await createListing({
        address,
        neighborhood,
        contacts,
        priceUsd,
        capacity,
        latitude,
        longitude,
      });
      resolvedListingId = created.listingId;
    }

    await appendPendingReview({
      listingId: resolvedListingId,
      rating,
      recommended,
      comment,
      priceUsd: submittedPriceUsd,
      semester: semester || undefined,
      studentName: studentName || undefined,
      studentContact: studentContact || undefined,
      studentEmail: studentEmail || undefined,
      shareContactInfo,
    });

    return NextResponse.json({ ok: true, listingId: resolvedListingId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create review" }, { status: 500 });
  }
}

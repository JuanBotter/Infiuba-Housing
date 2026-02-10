import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { canSubmitReviews, getRoleFromRequestAsync } from "@/lib/auth";
import { createListing, getListingById } from "@/lib/data";
import { isStrictEmail, normalizeEmailInput } from "@/lib/email";
import { asObject, parseDelimitedList, parseOptionalNumber, parseString } from "@/lib/request-validation";
import { validateSameOriginRequest } from "@/lib/request-origin";
import { parseReviewImageUrls } from "@/lib/review-images";
import { appendPendingReview } from "@/lib/reviews-store";
import { isValidSemester } from "@/lib/semester-options";

const MAX_NEW_LISTING_CONTACTS = 20;
const MAX_NEW_LISTING_CONTACT_LENGTH = 180;

function parseContacts(value: unknown) {
  const parsedContacts = parseDelimitedList(value, { maxItems: MAX_NEW_LISTING_CONTACTS });

  const hasContactTooLong = parsedContacts.some((item) => item.length > MAX_NEW_LISTING_CONTACT_LENGTH);
  return {
    contacts: parsedContacts,
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

    const payload = asObject(await request.json().catch(() => null));
    const listingId = parseString(payload?.listingId, { maxLength: 200 });
    const comment = parseString(payload?.comment, { maxLength: 1000 });
    const semester = parseString(payload?.semester, { maxLength: 60 });
    const studentName = parseString(payload?.studentName, { maxLength: 80 });
    let studentContact = parseString(payload?.studentContact, { maxLength: 120 });
    let studentEmail = parseString(payload?.studentEmail, { maxLength: 120 });
    const shareContactInfo = payload?.shareContactInfo === true;
    const submittedPriceUsd = parseOptionalNumber(payload?.priceUsd);
    const parsedReviewImageUrls = parseReviewImageUrls(payload?.reviewImageUrls);

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
    if (!semester) {
      return NextResponse.json({ error: "Semester is required" }, { status: 400 });
    }
    if (!isValidSemester(semester)) {
      return NextResponse.json({ error: "Invalid semester" }, { status: 400 });
    }
    if (submittedPriceUsd === undefined) {
      return NextResponse.json({ error: "Rent is required" }, { status: 400 });
    }
    if (submittedPriceUsd <= 0 || submittedPriceUsd > 20000) {
      return NextResponse.json({ error: "Invalid rent value" }, { status: 400 });
    }
    if (studentEmail) {
      if (!isStrictEmail(studentEmail)) {
        return NextResponse.json({ error: "Invalid contact email" }, { status: 400 });
      }
      studentEmail = normalizeEmailInput(studentEmail);
    }
    if (studentContact.includes("@")) {
      if (!isStrictEmail(studentContact)) {
        return NextResponse.json({ error: "Invalid contact email" }, { status: 400 });
      }
      studentContact = normalizeEmailInput(studentContact);
    }
    if (shareContactInfo && !studentEmail && !studentContact) {
      return NextResponse.json(
        { error: "Add an email or phone number to share contact info" },
        { status: 400 },
      );
    }
    if (!parsedReviewImageUrls.ok) {
      return NextResponse.json({ error: parsedReviewImageUrls.error }, { status: 400 });
    }

    let resolvedListingId = listingId;
    let createdNewListing = false;
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
      const address = parseString(payload?.address, { maxLength: 180 });
      const neighborhood = parseString(payload?.neighborhood, { maxLength: 80 });
      const { contacts, hasContactTooLong } = parseContacts(payload?.contacts);
      const capacity = parseOptionalNumber(payload?.capacity);
      const latitude = parseOptionalNumber(payload?.latitude);
      const longitude = parseOptionalNumber(payload?.longitude);

      if (address.length < 6) {
        return NextResponse.json({ error: "Invalid address" }, { status: 400 });
      }
      if (neighborhood.length < 2) {
        return NextResponse.json({ error: "Invalid neighborhood" }, { status: 400 });
      }
      if (contacts.length === 0) {
        return NextResponse.json({ error: "Owner contact is required" }, { status: 400 });
      }
      if (hasContactTooLong) {
        return NextResponse.json(
          {
            error: `Each contact must be at most ${MAX_NEW_LISTING_CONTACT_LENGTH} characters`,
          },
          { status: 400 },
        );
      }
      if (capacity === undefined) {
        return NextResponse.json({ error: "Capacity is required" }, { status: 400 });
      }
      if (capacity <= 0 || capacity > 50) {
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
        capacity,
        latitude,
        longitude,
      });
      resolvedListingId = created.listingId;
      createdNewListing = true;
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
      imageUrls: parsedReviewImageUrls.urls,
    });

    if (createdNewListing) {
      revalidateTag("public-listings", "max");
      revalidateTag("public-neighborhoods", "max");
      revalidateTag("public-dataset-meta", "max");
    }

    return NextResponse.json({ ok: true, listingId: resolvedListingId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create review" }, { status: 500 });
  }
}

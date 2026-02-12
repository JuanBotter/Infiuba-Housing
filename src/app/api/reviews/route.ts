import { NextResponse } from "next/server";

import { requireSameOrigin } from "@/lib/api-route-helpers";
import { canSubmitReviews, getRoleFromRequestAsync } from "@/lib/auth";
import { revalidatePublicListingsDataset } from "@/lib/cache-tags";
import { createListing, getListingById } from "@/lib/data";
import {
  LISTING_ADDRESS_MAX_LENGTH,
  LISTING_CONTACT_MAX_LENGTH,
  LISTING_ID_MAX_LENGTH,
  LISTING_NEIGHBORHOOD_MAX_LENGTH,
  hasListingContactTooLong,
  isSafeListingAddress,
  isSafeListingNeighborhood,
  isValidListingCapacity,
  normalizeReviewerContactFields,
  parseListingContactsFromDelimited,
} from "@/lib/domain-constraints";
import { asObject, parseOptionalNumber, parseString } from "@/lib/request-validation";
import {
  buildReviewApiErrorPayload,
  REVIEW_API_ERROR_CODES,
  type ReviewApiErrorCode,
} from "@/lib/review-api-errors";
import { parseReviewImageUrls } from "@/lib/review-images";
import { appendPendingReview } from "@/lib/reviews-store";
import { isValidSemester } from "@/lib/semester-options";

function parseContacts(value: unknown) {
  const parsedContacts = parseListingContactsFromDelimited(value);
  const hasContactTooLong = hasListingContactTooLong(parsedContacts);
  return {
    contacts: parsedContacts,
    hasContactTooLong,
  };
}

function reviewApiError(code: ReviewApiErrorCode, message: string, status: number) {
  return NextResponse.json(buildReviewApiErrorPayload(code, message), { status });
}

export async function POST(request: Request) {
  try {
    const sameOriginResponse = requireSameOrigin(request);
    if (sameOriginResponse) {
      return sameOriginResponse;
    }

    const role = await getRoleFromRequestAsync(request);
    if (!canSubmitReviews(role)) {
      return reviewApiError(
        REVIEW_API_ERROR_CODES.SUBMIT_NOT_ALLOWED,
        "Only whitelisted students can submit reviews.",
        403,
      );
    }

    const payload = asObject(await request.json().catch(() => null));
    const listingId = parseString(payload?.listingId, { maxLength: LISTING_ID_MAX_LENGTH });
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
      return reviewApiError(REVIEW_API_ERROR_CODES.INVALID_RATING, "Invalid rating", 400);
    }
    if (typeof recommended !== "boolean") {
      return reviewApiError(
        REVIEW_API_ERROR_CODES.INVALID_RECOMMENDATION,
        "Invalid recommendation value",
        400,
      );
    }
    if (comment.length < 12) {
      return reviewApiError(REVIEW_API_ERROR_CODES.COMMENT_TOO_SHORT, "Comment is too short", 400);
    }
    if (!semester) {
      return reviewApiError(REVIEW_API_ERROR_CODES.SEMESTER_REQUIRED, "Semester is required", 400);
    }
    if (!isValidSemester(semester)) {
      return reviewApiError(REVIEW_API_ERROR_CODES.INVALID_SEMESTER, "Invalid semester", 400);
    }
    if (submittedPriceUsd === undefined) {
      return reviewApiError(REVIEW_API_ERROR_CODES.RENT_REQUIRED, "Rent is required", 400);
    }
    if (submittedPriceUsd <= 0 || submittedPriceUsd > 20000) {
      return reviewApiError(REVIEW_API_ERROR_CODES.INVALID_RENT, "Invalid rent value", 400);
    }

    const normalizedContactFields = normalizeReviewerContactFields(studentEmail, studentContact);
    if (!normalizedContactFields.ok) {
      return reviewApiError(
        REVIEW_API_ERROR_CODES.INVALID_CONTACT_EMAIL,
        "Invalid contact email",
        400,
      );
    }
    studentEmail = normalizedContactFields.studentEmail;
    studentContact = normalizedContactFields.studentContact;
    if (shareContactInfo && !studentEmail && !studentContact) {
      return reviewApiError(
        REVIEW_API_ERROR_CODES.CONTACT_SHARE_REQUIRES_CONTACT,
        "Add an email or phone number to share contact info",
        400,
      );
    }
    if (!parsedReviewImageUrls.ok) {
      const errorCode =
        parsedReviewImageUrls.code === "too_many"
          ? REVIEW_API_ERROR_CODES.REVIEW_IMAGES_TOO_MANY
          : REVIEW_API_ERROR_CODES.REVIEW_IMAGES_INVALID;
      return reviewApiError(errorCode, parsedReviewImageUrls.error, 400);
    }

    let resolvedListingId = listingId;
    let createdNewListing = false;
    if (listingId) {
      const listing = await getListingById(listingId);
      if (!listing) {
        return reviewApiError(REVIEW_API_ERROR_CODES.INVALID_LISTING_ID, "Invalid listingId", 400);
      }

      // Backwards compatibility for detail page review form.
      const isLegacyPayload =
        payload?.confirmExistingDetails === undefined &&
        payload?.address === undefined &&
        payload?.neighborhood === undefined;

      if (!isLegacyPayload && confirmExistingDetails !== true) {
        return reviewApiError(
          REVIEW_API_ERROR_CODES.LISTING_CONFIRMATION_REQUIRED,
          "Please confirm property details for existing listings",
          400,
        );
      }
    } else {
      const address = parseString(payload?.address, { maxLength: LISTING_ADDRESS_MAX_LENGTH });
      const neighborhood = parseString(payload?.neighborhood, {
        maxLength: LISTING_NEIGHBORHOOD_MAX_LENGTH,
      });
      const { contacts, hasContactTooLong } = parseContacts(payload?.contacts);
      const capacity = parseOptionalNumber(payload?.capacity);
      const latitude = parseOptionalNumber(payload?.latitude);
      const longitude = parseOptionalNumber(payload?.longitude);

      if (address.length < 6) {
        return reviewApiError(REVIEW_API_ERROR_CODES.INVALID_ADDRESS, "Invalid address", 400);
      }
      if (!isSafeListingAddress(address)) {
        return reviewApiError(REVIEW_API_ERROR_CODES.INVALID_ADDRESS, "Invalid address", 400);
      }
      if (neighborhood.length < 2) {
        return reviewApiError(
          REVIEW_API_ERROR_CODES.INVALID_NEIGHBORHOOD,
          "Invalid neighborhood",
          400,
        );
      }
      if (!isSafeListingNeighborhood(neighborhood)) {
        return reviewApiError(
          REVIEW_API_ERROR_CODES.INVALID_NEIGHBORHOOD,
          "Invalid neighborhood",
          400,
        );
      }
      if (contacts.length === 0) {
        return reviewApiError(
          REVIEW_API_ERROR_CODES.OWNER_CONTACT_REQUIRED,
          "Owner contact is required",
          400,
        );
      }
      if (hasContactTooLong) {
        return reviewApiError(
          REVIEW_API_ERROR_CODES.CONTACT_TOO_LONG,
          `Each contact must be at most ${LISTING_CONTACT_MAX_LENGTH} characters`,
          400,
        );
      }
      if (capacity === undefined) {
        return reviewApiError(
          REVIEW_API_ERROR_CODES.CAPACITY_REQUIRED,
          "Capacity is required",
          400,
        );
      }
      if (!isValidListingCapacity(capacity)) {
        return reviewApiError(
          REVIEW_API_ERROR_CODES.INVALID_CAPACITY,
          "Invalid capacity value",
          400,
        );
      }

      const latitudeProvided = latitude !== undefined;
      const longitudeProvided = longitude !== undefined;
      if (latitudeProvided !== longitudeProvided) {
        return reviewApiError(
          REVIEW_API_ERROR_CODES.COORDINATES_MISMATCH,
          "Latitude and longitude must be provided together",
          400,
        );
      }
      if (latitudeProvided && (latitude < -90 || latitude > 90)) {
        return reviewApiError(REVIEW_API_ERROR_CODES.INVALID_LATITUDE, "Invalid latitude", 400);
      }
      if (longitudeProvided && (longitude < -180 || longitude > 180)) {
        return reviewApiError(
          REVIEW_API_ERROR_CODES.INVALID_LONGITUDE,
          "Invalid longitude",
          400,
        );
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
      revalidatePublicListingsDataset();
    }

    return NextResponse.json({ ok: true, listingId: resolvedListingId }, { status: 201 });
  } catch {
    return reviewApiError(REVIEW_API_ERROR_CODES.CREATE_FAILED, "Could not create review", 500);
  }
}

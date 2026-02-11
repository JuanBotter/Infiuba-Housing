export const REVIEW_API_ERROR_CODES = {
  SUBMIT_NOT_ALLOWED: "review_submit_not_allowed",
  INVALID_RATING: "review_invalid_rating",
  INVALID_RECOMMENDATION: "review_invalid_recommendation",
  COMMENT_TOO_SHORT: "review_comment_too_short",
  SEMESTER_REQUIRED: "review_semester_required",
  INVALID_SEMESTER: "review_invalid_semester",
  RENT_REQUIRED: "review_rent_required",
  INVALID_RENT: "review_invalid_rent",
  INVALID_CONTACT_EMAIL: "review_invalid_contact_email",
  CONTACT_SHARE_REQUIRES_CONTACT: "review_contact_share_requires_contact",
  REVIEW_IMAGES_TOO_MANY: "review_images_too_many",
  REVIEW_IMAGES_INVALID: "review_images_invalid",
  INVALID_LISTING_ID: "review_invalid_listing_id",
  LISTING_CONFIRMATION_REQUIRED: "review_listing_confirmation_required",
  INVALID_ADDRESS: "review_invalid_address",
  INVALID_NEIGHBORHOOD: "review_invalid_neighborhood",
  OWNER_CONTACT_REQUIRED: "review_owner_contact_required",
  CONTACT_TOO_LONG: "review_contact_too_long",
  CAPACITY_REQUIRED: "review_capacity_required",
  INVALID_CAPACITY: "review_invalid_capacity",
  COORDINATES_MISMATCH: "review_coordinates_mismatch",
  INVALID_LATITUDE: "review_invalid_latitude",
  INVALID_LONGITUDE: "review_invalid_longitude",
  CREATE_FAILED: "review_create_failed",
} as const;

export type ReviewApiErrorCode =
  (typeof REVIEW_API_ERROR_CODES)[keyof typeof REVIEW_API_ERROR_CODES];

export interface ReviewApiErrorPayload {
  code: ReviewApiErrorCode;
  message: string;
  // Compatibility alias while clients migrate from string-only `error`.
  error: string;
}

export function buildReviewApiErrorPayload(
  code: ReviewApiErrorCode,
  message: string,
): ReviewApiErrorPayload {
  return {
    code,
    message,
    error: message,
  };
}

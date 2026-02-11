import type { Messages } from "@/i18n/messages";
import { REVIEW_API_ERROR_CODES } from "@/lib/review-api-errors";
import { MAX_REVIEW_IMAGE_COUNT } from "@/lib/review-images";

export interface ReviewDraft {
  rating: string;
  priceUsd: string;
  recommended: "yes" | "no" | "";
  comment: string;
  semester: string;
  studentName: string;
  studentContact: string;
  studentEmail: string;
  shareContactInfo: boolean;
  imageUrls: string[];
}

export function createInitialReviewDraft(): ReviewDraft {
  return {
    rating: "0",
    priceUsd: "",
    recommended: "",
    comment: "",
    semester: "",
    studentName: "",
    studentContact: "",
    studentEmail: "",
    shareContactInfo: false,
    imageUrls: [],
  };
}

export function buildReviewPayload(draft: ReviewDraft) {
  const resolvedRecommendation =
    draft.recommended === "yes" ? true : draft.recommended === "no" ? false : undefined;
  return {
    rating: Number(draft.rating),
    priceUsd: draft.priceUsd ? Number(draft.priceUsd) : undefined,
    recommended: resolvedRecommendation,
    comment: draft.comment,
    semester: draft.semester,
    studentName: draft.studentName,
    studentContact: draft.studentContact,
    studentEmail: draft.studentEmail,
    shareContactInfo: draft.shareContactInfo,
    reviewImageUrls: draft.imageUrls,
  };
}

export interface ReviewApiErrorResponse {
  code: string;
  message: string;
}

export async function readApiErrorMessage(response: Response): Promise<ReviewApiErrorResponse> {
  const body = (await response.json().catch(() => null)) as
    | { code?: unknown; message?: unknown; error?: unknown }
    | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const messageValue =
    typeof body?.message === "string"
      ? body.message
      : typeof body?.error === "string"
        ? body.error
        : "";
  return {
    code,
    message: messageValue.trim(),
  };
}

export function mapReviewApiErrorMessage(apiError: ReviewApiErrorResponse, messages: Messages) {
  const code = apiError.code.trim();
  if (code === REVIEW_API_ERROR_CODES.SUBMIT_NOT_ALLOWED) {
    return messages.accessNotAllowedError;
  }
  if (code === REVIEW_API_ERROR_CODES.CONTACT_SHARE_REQUIRES_CONTACT) {
    return messages.formContactShareError;
  }
  if (code === REVIEW_API_ERROR_CODES.REVIEW_IMAGES_TOO_MANY) {
    return messages.formPhotosMaxError.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT));
  }

  const error = apiError.message.trim();
  if (!error) {
    return "";
  }

  if (error === "This property is already in the database.") {
    return messages.addPropertyDuplicateError;
  }
  if (error === "Only whitelisted students can submit reviews.") {
    return messages.accessNotAllowedError;
  }
  if (error === "Add an email or phone number to share contact info") {
    return messages.formContactShareError;
  }

  const reviewImageLimit = error.match(/A (?:review|listing) can include at most (\d+) images/i);
  if (reviewImageLimit?.[1]) {
    return messages.formPhotosMaxError.replace("{count}", reviewImageLimit[1]);
  }

  return "";
}

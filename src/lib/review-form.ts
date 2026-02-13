import type { Messages } from "@/i18n/messages";
import { REVIEW_API_ERROR_CODES } from "@/lib/review-api-errors";
import { uploadReviewImageFiles } from "@/lib/review-image-upload";
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

export function validateReviewDraft(draft: ReviewDraft, messages: Messages) {
  const nextErrors: Record<string, string> = {};
  const ratingValue = Number(draft.rating);
  const hasRating = Number.isFinite(ratingValue) && ratingValue > 0;
  const hasRecommendation = draft.recommended === "yes" || draft.recommended === "no";
  const priceValue = Number(draft.priceUsd);

  if (!hasRating) {
    nextErrors.rating = messages.formRequiredField;
  }
  if (!hasRecommendation) {
    nextErrors.recommended = messages.formRequiredField;
  }
  if (!Number.isFinite(priceValue) || priceValue <= 0) {
    nextErrors.priceUsd = messages.formRequiredField;
  }
  if (draft.comment.trim().length < 12) {
    nextErrors.comment = messages.formRequiredField;
  }
  if (!draft.semester.trim()) {
    nextErrors.semester = messages.formRequiredField;
  }
  if (draft.shareContactInfo && !draft.studentEmail.trim() && !draft.studentContact.trim()) {
    nextErrors.contactShare = messages.formContactShareError;
  }

  return nextErrors;
}

export interface ReviewFormErrorSummaryItem {
  key: string;
  label: string;
  message: string;
}

const REVIEW_FORM_ERROR_SUMMARY_ORDER = [
  "address",
  "neighborhood",
  "contacts",
  "capacity",
  "priceUsd",
  "rating",
  "recommended",
  "comment",
  "semester",
  "contactShare",
] as const;

export function getReviewFormErrorSummaryItems(
  formErrors: Record<string, string>,
  messages: Messages,
): ReviewFormErrorSummaryItem[] {
  const labelMap: Record<string, string> = {
    address: messages.addPropertyAddressLabel,
    neighborhood: messages.neighborhoodLabel,
    contacts: messages.addPropertyContactsLabel,
    capacity: messages.capacityLabel,
    priceUsd: messages.formPriceLabel,
    rating: messages.formRating,
    recommended: messages.formRecommended,
    comment: messages.formComment,
    semester: messages.formSemester,
    contactShare: messages.formContactSection,
  };

  const seen = new Set<string>();
  const items: ReviewFormErrorSummaryItem[] = [];

  for (const key of REVIEW_FORM_ERROR_SUMMARY_ORDER) {
    const message = formErrors[key];
    if (!message) {
      continue;
    }
    seen.add(key);
    items.push({
      key,
      label: labelMap[key] ?? key,
      message,
    });
  }

  const remainingKeys = Object.keys(formErrors)
    .filter((key) => !seen.has(key))
    .sort((a, b) => a.localeCompare(b));

  for (const key of remainingKeys) {
    const message = formErrors[key];
    if (!message) {
      continue;
    }
    items.push({
      key,
      label: labelMap[key] ?? key,
      message,
    });
  }

  return items;
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

export type SubmitReviewResult =
  | { ok: true }
  | { ok: false; kind: "unavailable" | "api" | "network"; message: string };

export async function submitReview(
  payload: Record<string, unknown>,
  messages: Messages,
): Promise<SubmitReviewResult> {
  try {
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 503) {
      return { ok: false, kind: "unavailable", message: "" };
    }

    if (!response.ok) {
      const apiError = await readApiErrorMessage(response);
      return {
        ok: false,
        kind: "api",
        message: mapReviewApiErrorMessage(apiError, messages),
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, kind: "network", message: "" };
  }
}

export async function uploadReviewDraftImages(
  files: File[],
  existingImageCount: number,
  messages: Messages,
) {
  const remainingSlots = MAX_REVIEW_IMAGE_COUNT - existingImageCount;
  if (remainingSlots <= 0) {
    return {
      ok: false as const,
      message: messages.formPhotosMaxError.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT)),
    };
  }

  try {
    const uploaded = await uploadReviewImageFiles(files.slice(0, remainingSlots));
    if (!uploaded.ok) {
      return {
        ok: false as const,
        message: uploaded.error,
      };
    }

    return {
      ok: true as const,
      urls: uploaded.urls.slice(0, remainingSlots),
    };
  } catch {
    return {
      ok: false as const,
      message: "Image upload failed",
    };
  }
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

import type { Messages } from "@/i18n/messages";

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

export async function readApiErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "";
}

export function mapReviewApiErrorMessage(rawError: string, messages: Messages) {
  const error = rawError.trim();
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

  const listingImageLimit = error.match(/A listing can include at most (\d+) images/i);
  if (listingImageLimit?.[1]) {
    return messages.formPhotosMaxError.replace("{count}", listingImageLimit[1]);
  }

  return "";
}

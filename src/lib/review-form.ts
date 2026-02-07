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
  };
}

export async function readApiErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "";
}

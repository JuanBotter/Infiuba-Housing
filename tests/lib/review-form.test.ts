import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMessages } from "@/lib/i18n";
import { REVIEW_API_ERROR_CODES } from "@/lib/review-api-errors";
import { MAX_REVIEW_IMAGE_COUNT } from "@/lib/review-images";
import {
  createInitialReviewDraft,
  mapReviewApiErrorMessage,
  readApiErrorMessage,
  submitReview,
  uploadReviewDraftImages,
  validateReviewDraft,
} from "@/lib/review-form";

const messages = getMessages("en");

describe("review-form api error mapping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reads structured code/message payloads", async () => {
    const response = new Response(
      JSON.stringify({
        code: REVIEW_API_ERROR_CODES.INVALID_RATING,
        message: "Invalid rating",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );

    await expect(readApiErrorMessage(response)).resolves.toEqual({
      code: REVIEW_API_ERROR_CODES.INVALID_RATING,
      message: "Invalid rating",
    });
  });

  it("falls back to legacy error payload shape", async () => {
    const response = new Response(JSON.stringify({ error: "Legacy error" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    await expect(readApiErrorMessage(response)).resolves.toEqual({
      code: "",
      message: "Legacy error",
    });
  });

  it("maps structured codes to localized messages", () => {
    expect(
      mapReviewApiErrorMessage(
        {
          code: REVIEW_API_ERROR_CODES.SUBMIT_NOT_ALLOWED,
          message: "Only whitelisted students can submit reviews.",
        },
        messages,
      ),
    ).toBe(messages.accessNotAllowedError);

    expect(
      mapReviewApiErrorMessage(
        {
          code: REVIEW_API_ERROR_CODES.CONTACT_SHARE_REQUIRES_CONTACT,
          message: "Add an email or phone number to share contact info",
        },
        messages,
      ),
    ).toBe(messages.formContactShareError);
  });

  it("keeps legacy string fallback for old server errors", () => {
    expect(
      mapReviewApiErrorMessage(
        {
          code: "",
          message: "Only whitelisted students can submit reviews.",
        },
        messages,
      ),
    ).toBe(messages.accessNotAllowedError);
  });

  it("validates required review fields and contact-sharing rules", () => {
    const draft = createInitialReviewDraft();
    draft.shareContactInfo = true;

    expect(validateReviewDraft(draft, messages)).toEqual({
      rating: messages.formRequiredField,
      recommended: messages.formRequiredField,
      priceUsd: messages.formRequiredField,
      comment: messages.formRequiredField,
      semester: messages.formRequiredField,
      contactShare: messages.formContactShareError,
    });
  });

  it("returns unavailable result for 503 review submissions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("unavailable", { status: 503 }));

    await expect(submitReview({ listingId: "abc" }, messages)).resolves.toEqual({
      ok: false,
      kind: "unavailable",
      message: "",
    });
  });

  it("maps API errors for failed review submissions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: REVIEW_API_ERROR_CODES.SUBMIT_NOT_ALLOWED,
          message: "Only whitelisted students can submit reviews.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(submitReview({ listingId: "abc" }, messages)).resolves.toEqual({
      ok: false,
      kind: "api",
      message: messages.accessNotAllowedError,
    });
  });

  it("returns network error result when review submit request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));

    await expect(submitReview({ listingId: "abc" }, messages)).resolves.toEqual({
      ok: false,
      kind: "network",
      message: "",
    });
  });

  it("returns max-images error before upload when no slots remain", async () => {
    await expect(
      uploadReviewDraftImages([{} as File], MAX_REVIEW_IMAGE_COUNT, messages),
    ).resolves.toEqual({
      ok: false,
      message: messages.formPhotosMaxError.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT)),
    });
  });
});

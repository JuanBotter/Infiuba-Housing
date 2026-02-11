import { describe, expect, it } from "vitest";

import { getMessages } from "@/lib/i18n";
import { REVIEW_API_ERROR_CODES } from "@/lib/review-api-errors";
import { mapReviewApiErrorMessage, readApiErrorMessage } from "@/lib/review-form";

const messages = getMessages("en");

describe("review-form api error mapping", () => {
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
});

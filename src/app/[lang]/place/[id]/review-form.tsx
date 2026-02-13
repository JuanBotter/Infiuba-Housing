"use client";

import { ChangeEvent, FormEvent, useState } from "react";

import { ReviewCoreFields } from "@/components/review-core-fields";
import type { Messages } from "@/i18n/messages";
import {
  buildReviewPayload,
  submitReview,
} from "@/lib/review-form";
import { useReviewFormCore } from "@/lib/use-review-form-core";
import type { Lang } from "@/types";

interface ReviewFormProps {
  lang: Lang;
  listingId: string;
  messages: Messages;
  canUploadImages?: boolean;
}

export function ReviewForm({ lang, listingId, messages, canUploadImages = true }: ReviewFormProps) {
  const t = messages;
  const {
    reviewDraft,
    setReviewDraft,
    formErrors,
    setFormErrors,
    clearFormError,
    uploadingImages,
    uploadReviewImages,
    removeReviewImage,
    validateDraft,
    resetDraft,
  } = useReviewFormCore(t);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [serverMessage, setServerMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateDraft();

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      setStatus("error");
      setServerMessage(t.formRequiredFieldsError);
      return;
    }

    setStatus("sending");
    setServerMessage("");
    setFormErrors({});

    const submitResult = await submitReview(
      {
        listingId,
        ...buildReviewPayload(reviewDraft),
      },
      t,
    );

    if (!submitResult.ok) {
      setServerMessage(submitResult.message);
      setStatus("error");
      return;
    }

    setStatus("success");
    setFormErrors({});
    resetDraft();
  }

  async function onUploadImages(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files || []);
    input.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    const result = await uploadReviewImages(selectedFiles);
    if (!result.ok) {
      setStatus("error");
      setServerMessage(result.message);
      return;
    }

    setStatus("idle");
    setServerMessage("");
  }

  return (
    <form className="review-form" onSubmit={onSubmit} noValidate>
      <ReviewCoreFields
        lang={lang}
        messages={t}
        reviewDraft={reviewDraft}
        formErrors={formErrors}
        setReviewDraft={setReviewDraft}
        clearFormError={clearFormError}
        uploadingImages={uploadingImages}
        onUploadImages={onUploadImages}
        onRemoveImage={removeReviewImage}
        canUploadImages={canUploadImages}
        idPrefix={`review-${listingId}`}
        ratingName={`review-rating-${listingId}`}
        recommendationName={`review-recommend-${listingId}`}
      />

      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? t.formSending : t.formSubmit}
      </button>

      {status === "success" ? <p className="form-status success">{t.formSuccess}</p> : null}
      {status === "error" ? <p className="form-status error">{serverMessage || t.formError}</p> : null}
    </form>
  );
}

"use client";

import { useState } from "react";

import type { Messages } from "@/i18n/messages";
import {
  createInitialReviewDraft,
  uploadReviewDraftImages,
  validateReviewDraft,
  type ReviewDraft,
} from "@/lib/review-form";
import { MAX_REVIEW_IMAGE_COUNT } from "@/lib/review-images";

export function useReviewFormCore(messages: Messages) {
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>(createInitialReviewDraft);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [uploadingImages, setUploadingImages] = useState(false);

  function clearFormError(key: string) {
    setFormErrors((previous) => {
      if (!previous[key]) {
        return previous;
      }
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  function removeReviewImage(index: number) {
    setReviewDraft((previous) => ({
      ...previous,
      imageUrls: previous.imageUrls.filter((_, imageIndex) => imageIndex !== index),
    }));
  }

  async function uploadReviewImages(files: File[]) {
    if (files.length === 0) {
      return { ok: true as const };
    }

    setUploadingImages(true);
    const uploaded = await uploadReviewDraftImages(files, reviewDraft.imageUrls.length, messages);
    setUploadingImages(false);

    if (!uploaded.ok) {
      return uploaded;
    }

    setReviewDraft((previous) => ({
      ...previous,
      imageUrls: [...previous.imageUrls, ...uploaded.urls].slice(0, MAX_REVIEW_IMAGE_COUNT),
    }));

    return { ok: true as const };
  }

  function validateDraft() {
    return validateReviewDraft(reviewDraft, messages);
  }

  function resetDraft() {
    setReviewDraft(createInitialReviewDraft());
  }

  return {
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
  };
}

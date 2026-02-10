"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

import { getMessages } from "@/lib/i18n";
import {
  buildReviewPayload,
  createInitialReviewDraft,
  mapReviewApiErrorMessage,
  readApiErrorMessage,
} from "@/lib/review-form";
import { SEMESTER_OPTIONS } from "@/lib/semester-options";
import { StarRating } from "@/components/star-rating";
import { ImageGalleryViewer } from "@/components/image-gallery-viewer";
import { uploadReviewImageFiles } from "@/lib/review-image-upload";
import { MAX_REVIEW_IMAGE_COUNT } from "@/lib/review-images";
import type { Lang } from "@/types";

interface ReviewFormProps {
  lang: Lang;
  listingId: string;
}

export function ReviewForm({ lang, listingId }: ReviewFormProps) {
  const t = useMemo(() => getMessages(lang), [lang]);
  const [reviewDraft, setReviewDraft] = useState(createInitialReviewDraft);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [serverMessage, setServerMessage] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const ratingValue = Number(reviewDraft.rating);
    const hasRating = Number.isFinite(ratingValue) && ratingValue > 0;
    const hasRecommendation =
      reviewDraft.recommended === "yes" || reviewDraft.recommended === "no";

    if (!hasRating) {
      nextErrors.rating = t.formRequiredField;
    }
    if (!hasRecommendation) {
      nextErrors.recommended = t.formRequiredField;
    }
    const priceValue = Number(reviewDraft.priceUsd);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      nextErrors.priceUsd = t.formRequiredField;
    }
    if (reviewDraft.comment.trim().length < 12) {
      nextErrors.comment = t.formRequiredField;
    }
    if (!reviewDraft.semester.trim()) {
      nextErrors.semester = t.formRequiredField;
    }
    if (
      reviewDraft.shareContactInfo &&
      !reviewDraft.studentEmail.trim() &&
      !reviewDraft.studentContact.trim()
    ) {
      nextErrors.contactShare = t.formContactShareError;
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      setStatus("error");
      setServerMessage(t.formRequiredFieldsError);
      return;
    }

    setStatus("sending");
    setServerMessage("");
    setFormErrors({});

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId,
          ...buildReviewPayload(reviewDraft),
        }),
      });

      if (!response.ok) {
        const apiError = await readApiErrorMessage(response);
        setServerMessage(mapReviewApiErrorMessage(apiError, t));
        setStatus("error");
        return;
      }

      setStatus("success");
      setFormErrors({});
      setReviewDraft(createInitialReviewDraft());
    } catch {
      setStatus("error");
    }
  }

  async function onUploadImages(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files || []);
    input.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    const remainingSlots = MAX_REVIEW_IMAGE_COUNT - reviewDraft.imageUrls.length;
    if (remainingSlots <= 0) {
      setStatus("error");
      setServerMessage(
        t.formPhotosMaxError.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT)),
      );
      return;
    }

    setUploadingImages(true);
    const uploaded = await uploadReviewImageFiles(selectedFiles.slice(0, remainingSlots));
    setUploadingImages(false);

    if (!uploaded.ok) {
      setStatus("error");
      setServerMessage(uploaded.error);
      return;
    }

    setReviewDraft((previous) => ({
      ...previous,
      imageUrls: [...previous.imageUrls, ...uploaded.urls].slice(0, MAX_REVIEW_IMAGE_COUNT),
    }));
    setStatus("idle");
    setServerMessage("");
  }

  const ratingErrorId = formErrors.rating ? `review-rating-${listingId}-error` : undefined;
  const recommendedErrorId = formErrors.recommended
    ? `review-recommended-${listingId}-error`
    : undefined;
  const priceErrorId = formErrors.priceUsd ? `review-price-${listingId}-error` : undefined;
  const commentErrorId = formErrors.comment ? `review-comment-${listingId}-error` : undefined;
  const semesterErrorId = formErrors.semester ? `review-semester-${listingId}-error` : undefined;
  const contactShareErrorId = formErrors.contactShare
    ? `review-contact-share-${listingId}-error`
    : undefined;

  return (
    <form className="review-form" onSubmit={onSubmit} noValidate>
      <div className="review-rating-row">
        <div className={`review-rating-field${formErrors.rating ? " is-invalid" : ""}`}>
          <StarRating
            name={`review-rating-${listingId}`}
            value={reviewDraft.rating}
            onChange={(nextValue) => {
              setReviewDraft((previous) => ({ ...previous, rating: nextValue }));
              clearFormError("rating");
            }}
            label={t.formRating}
            hint={t.formRatingHint}
            hasError={Boolean(formErrors.rating)}
            errorId={ratingErrorId}
          />
          {formErrors.rating ? (
            <p className="field-error" id={ratingErrorId}>
              {formErrors.rating}
            </p>
          ) : null}
        </div>

        <fieldset
          className={`review-choice${formErrors.recommended ? " is-invalid" : ""}`}
          aria-invalid={Boolean(formErrors.recommended)}
          aria-describedby={recommendedErrorId}
        >
          <legend>{t.formRecommended}</legend>
          <label className="review-choice__option">
            <input
              type="radio"
              name={`review-recommend-${listingId}`}
              value="yes"
              checked={reviewDraft.recommended === "yes"}
              onChange={() => {
                setReviewDraft((previous) => ({ ...previous, recommended: "yes" }));
                clearFormError("recommended");
              }}
            />
            <span>{t.yes}</span>
          </label>
          <label className="review-choice__option">
            <input
              type="radio"
              name={`review-recommend-${listingId}`}
              value="no"
              checked={reviewDraft.recommended === "no"}
              onChange={() => {
                setReviewDraft((previous) => ({ ...previous, recommended: "no" }));
                clearFormError("recommended");
              }}
            />
            <span>{t.no}</span>
          </label>
          {formErrors.recommended ? (
            <p className="field-error" id={recommendedErrorId}>
              {formErrors.recommended}
            </p>
          ) : null}
        </fieldset>
      </div>

      <label className={formErrors.priceUsd ? "is-invalid" : ""}>
        <span>{t.formPriceLabel}</span>
        <input
          type="number"
          min={1}
          max={20000}
          step="0.01"
          value={reviewDraft.priceUsd}
          onChange={(event) => {
            setReviewDraft((previous) => ({ ...previous, priceUsd: event.target.value }));
            clearFormError("priceUsd");
          }}
          required
          aria-invalid={Boolean(formErrors.priceUsd)}
          aria-describedby={priceErrorId}
        />
        {formErrors.priceUsd ? (
          <p className="field-error" id={priceErrorId}>
            {formErrors.priceUsd}
          </p>
        ) : null}
      </label>

      <label className={formErrors.comment ? "is-invalid" : ""}>
        <span>{t.formComment}</span>
        <textarea
          value={reviewDraft.comment}
          onChange={(event) => {
            setReviewDraft((previous) => ({ ...previous, comment: event.target.value }));
            clearFormError("comment");
          }}
          minLength={12}
          maxLength={1000}
          required
          aria-invalid={Boolean(formErrors.comment)}
          aria-describedby={commentErrorId}
        />
        {formErrors.comment ? (
          <p className="field-error" id={commentErrorId}>
            {formErrors.comment}
          </p>
        ) : null}
      </label>

      <fieldset className="review-images">
        <legend>{t.formReviewPhotosLabel}</legend>
        <p className="review-images__hint">
          {t.formPhotosHint.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT))}
        </p>
        <label className="button-link review-images__upload">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            multiple
            onChange={(event) => void onUploadImages(event)}
            disabled={uploadingImages || reviewDraft.imageUrls.length >= MAX_REVIEW_IMAGE_COUNT}
          />
          <span>{uploadingImages ? t.formPhotosUploading : t.formPhotosUploadButton}</span>
        </label>
        {reviewDraft.imageUrls.length > 0 ? (
          <ImageGalleryViewer
            lang={lang}
            images={reviewDraft.imageUrls}
            altBase={t.imageAltReview}
            ariaLabel={t.imageAriaSelectedReviewPhotos}
            onRemoveImage={(index) =>
              setReviewDraft((previous) => ({
                ...previous,
                imageUrls: previous.imageUrls.filter((_, imageIndex) => imageIndex !== index),
              }))
            }
            removeLabel={t.formPhotosRemoveButton}
          />
        ) : null}
      </fieldset>

      <label className={formErrors.semester ? "is-invalid" : ""}>
        <span>{t.formSemester}</span>
        <input
          type="text"
          value={reviewDraft.semester}
          onChange={(event) => {
            setReviewDraft((previous) => ({ ...previous, semester: event.target.value }));
            clearFormError("semester");
          }}
          placeholder={t.formSemesterPlaceholder}
          list="semester-options"
          required
          maxLength={8}
          aria-invalid={Boolean(formErrors.semester)}
          aria-describedby={semesterErrorId}
        />
        {formErrors.semester ? (
          <p className="field-error" id={semesterErrorId}>
            {formErrors.semester}
          </p>
        ) : null}
        <datalist id="semester-options">
          {SEMESTER_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </label>

      <fieldset
        className={`contact-section${formErrors.contactShare ? " is-invalid" : ""}`}
        aria-invalid={Boolean(formErrors.contactShare)}
        aria-describedby={contactShareErrorId}
      >
        <legend>{t.formContactSection}</legend>
        <label>
          <span>{t.formName}</span>
          <input
            type="text"
            value={reviewDraft.studentName}
            onChange={(event) =>
              setReviewDraft((previous) => ({ ...previous, studentName: event.target.value }))
            }
            maxLength={80}
          />
        </label>

        <label>
          <span>{t.formPhone}</span>
          <input
            type="text"
            value={reviewDraft.studentContact}
            onChange={(event) => {
              setReviewDraft((previous) => ({ ...previous, studentContact: event.target.value }));
              clearFormError("contactShare");
            }}
            maxLength={120}
          />
        </label>

        <label>
          <span>{t.formEmail}</span>
          <input
            type="email"
            value={reviewDraft.studentEmail}
            onChange={(event) => {
              setReviewDraft((previous) => ({ ...previous, studentEmail: event.target.value }));
              clearFormError("contactShare");
            }}
            maxLength={120}
          />
        </label>

        <label className="consent-checkbox">
          <input
            type="checkbox"
            checked={reviewDraft.shareContactInfo}
            onChange={(event) => {
              setReviewDraft((previous) => ({
                ...previous,
                shareContactInfo: event.target.checked,
              }));
              if (!event.target.checked) {
                clearFormError("contactShare");
              }
            }}
          />
          <span>{t.formContactConsentLabel}</span>
          <small>{t.formContactConsentHint}</small>
        </label>
        {formErrors.contactShare ? (
          <p className="field-error" id={contactShareErrorId}>
            {formErrors.contactShare}
          </p>
        ) : null}
      </fieldset>

      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? t.formSending : t.formSubmit}
      </button>

      {status === "success" ? <p className="form-status success">{t.formSuccess}</p> : null}
      {status === "error" ? <p className="form-status error">{serverMessage || t.formError}</p> : null}
    </form>
  );
}

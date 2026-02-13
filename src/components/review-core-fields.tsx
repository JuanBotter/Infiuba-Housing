"use client";

import type { ChangeEvent, Dispatch, SetStateAction } from "react";

import type { Messages } from "@/i18n/messages";
import { SEMESTER_OPTIONS } from "@/lib/semester-options";
import { MAX_REVIEW_IMAGE_COUNT } from "@/lib/review-images";
import type { ReviewDraft } from "@/lib/review-form";
import { ImageGalleryViewer } from "@/components/image-gallery-viewer";
import { PhoneInputWithCountry } from "@/components/phone-input-with-country";
import { StarRating } from "@/components/star-rating";
import type { Lang } from "@/types";

interface ReviewCoreFieldsProps {
  lang: Lang;
  messages: Messages;
  reviewDraft: ReviewDraft;
  formErrors: Record<string, string>;
  setReviewDraft: Dispatch<SetStateAction<ReviewDraft>>;
  clearFormError: (key: string) => void;
  uploadingImages: boolean;
  onUploadImages: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
  canUploadImages?: boolean;
  idPrefix: string;
  ratingName: string;
  recommendationName: string;
  variant?: "default" | "property";
}

export function ReviewCoreFields({
  lang,
  messages,
  reviewDraft,
  formErrors,
  setReviewDraft,
  clearFormError,
  uploadingImages,
  onUploadImages,
  onRemoveImage,
  canUploadImages = true,
  idPrefix,
  ratingName,
  recommendationName,
  variant = "default",
}: ReviewCoreFieldsProps) {
  const isPropertyVariant = variant === "property";
  const priceErrorId = formErrors.priceUsd ? `${idPrefix}-price-error` : undefined;
  const ratingErrorId = formErrors.rating ? `${idPrefix}-rating-error` : undefined;
  const recommendedErrorId = formErrors.recommended ? `${idPrefix}-recommended-error` : undefined;
  const commentErrorId = formErrors.comment ? `${idPrefix}-comment-error` : undefined;
  const semesterErrorId = formErrors.semester ? `${idPrefix}-semester-error` : undefined;
  const contactShareErrorId = formErrors.contactShare ? `${idPrefix}-contact-share-error` : undefined;
  const semesterListId = `${idPrefix}-semester-options`;

  return (
    <>
      <label className={formErrors.priceUsd ? "is-invalid" : ""}>
        <span>{messages.formPriceLabel}</span>
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

      <div
        className={
          isPropertyVariant
            ? "review-rating-row review-rating-row--property property-form__full"
            : "review-rating-row"
        }
      >
        <div className={`review-rating-field${formErrors.rating ? " is-invalid" : ""}`}>
          <StarRating
            name={ratingName}
            value={reviewDraft.rating}
            onChange={(nextValue) => {
              setReviewDraft((previous) => ({ ...previous, rating: nextValue }));
              clearFormError("rating");
            }}
            label={messages.formRating}
            hint={messages.formRatingHint}
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
          <legend>{messages.formRecommended}</legend>
          <label className="review-choice__option">
            <input
              type="radio"
              name={recommendationName}
              value="yes"
              checked={reviewDraft.recommended === "yes"}
              onChange={() => {
                setReviewDraft((previous) => ({ ...previous, recommended: "yes" }));
                clearFormError("recommended");
              }}
            />
            <span>{messages.yes}</span>
          </label>
          <label className="review-choice__option">
            <input
              type="radio"
              name={recommendationName}
              value="no"
              checked={reviewDraft.recommended === "no"}
              onChange={() => {
                setReviewDraft((previous) => ({ ...previous, recommended: "no" }));
                clearFormError("recommended");
              }}
            />
            <span>{messages.no}</span>
          </label>
          {formErrors.recommended ? (
            <p className="field-error" id={recommendedErrorId}>
              {formErrors.recommended}
            </p>
          ) : null}
        </fieldset>
      </div>

      <label className={`${isPropertyVariant ? "property-form__full" : ""}${formErrors.comment ? " is-invalid" : ""}`}>
        <span>{messages.formComment}</span>
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

      <label className={formErrors.semester ? "is-invalid" : ""}>
        <span>{messages.formSemester}</span>
        <input
          type="text"
          value={reviewDraft.semester}
          onChange={(event) => {
            setReviewDraft((previous) => ({ ...previous, semester: event.target.value }));
            clearFormError("semester");
          }}
          placeholder={messages.formSemesterPlaceholder}
          list={semesterListId}
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
        <datalist id={semesterListId}>
          {SEMESTER_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </label>

      {canUploadImages ? (
        <fieldset className={isPropertyVariant ? "review-images property-form__full" : "review-images"}>
          <legend>{messages.formReviewPhotosLabel}</legend>
          <p className="review-images__hint">
            {messages.formPhotosHint.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT))}
          </p>
          <label className="button-link review-images__upload">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              multiple
              onChange={(event) => void onUploadImages(event)}
              disabled={uploadingImages || reviewDraft.imageUrls.length >= MAX_REVIEW_IMAGE_COUNT}
            />
            <span>{uploadingImages ? messages.formPhotosUploading : messages.formPhotosUploadButton}</span>
          </label>
          {reviewDraft.imageUrls.length > 0 ? (
            <ImageGalleryViewer
              lang={lang}
              images={reviewDraft.imageUrls}
              altBase={messages.imageAltReview}
              ariaLabel={messages.imageAriaSelectedReviewPhotos}
              onRemoveImage={onRemoveImage}
              removeLabel={messages.formPhotosRemoveButton}
            />
          ) : null}
        </fieldset>
      ) : null}

      <fieldset
        className={`${isPropertyVariant ? "contact-section property-form__full" : "contact-section"}${
          formErrors.contactShare ? " is-invalid" : ""
        }`}
        aria-invalid={Boolean(formErrors.contactShare)}
        aria-describedby={contactShareErrorId}
      >
        <legend>{messages.formContactSection}</legend>
        <label>
          <span>{messages.formName}</span>
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
          <span>{messages.formPhone}</span>
          <PhoneInputWithCountry
            lang={lang}
            value={reviewDraft.studentContact}
            onChange={(nextValue) => {
              setReviewDraft((previous) => ({ ...previous, studentContact: nextValue }));
              clearFormError("contactShare");
            }}
            maxLength={120}
            pickerLabel={messages.phoneCountryPickerLabel}
            searchPlaceholder={messages.phoneCountrySearchPlaceholder}
            noResultsLabel={messages.phoneCountryNoResults}
            numberPlaceholder={messages.phoneNumberPlaceholder}
          />
        </label>

        <label>
          <span>{messages.formEmail}</span>
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
          <span>{messages.formContactConsentLabel}</span>
          <small>{messages.formContactConsentHint}</small>
        </label>
        {formErrors.contactShare ? (
          <p className="field-error" id={contactShareErrorId}>
            {formErrors.contactShare}
          </p>
        ) : null}
      </fieldset>
    </>
  );
}

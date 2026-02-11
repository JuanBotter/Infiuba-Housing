"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ImageGalleryViewer } from "@/components/image-gallery-viewer";
import { apiPostJson, mapApiClientErrorMessage } from "@/lib/api-client";
import { uploadReviewImageFiles } from "@/lib/review-image-upload";
import { MAX_REVIEW_IMAGE_COUNT } from "@/lib/review-images";
import type { Messages } from "@/i18n/messages";
import type { Lang, Review } from "@/types";

interface AdminReviewEditFormProps {
  lang: Lang;
  messages: Messages;
  review: Review;
}

export function AdminReviewEditForm({ lang, messages, review }: AdminReviewEditFormProps) {
  const router = useRouter();
  const initialRating = useMemo(() => {
    if (typeof review.rating === "number" && review.rating >= 1 && review.rating <= 5) {
      return review.rating;
    }
    return 1;
  }, [review.rating]);

  const [isEditing, setIsEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [rating, setRating] = useState(String(initialRating));
  const [recommended, setRecommended] = useState(review.recommended === true);
  const [comment, setComment] = useState(review.comment || "");
  const [priceUsd, setPriceUsd] = useState(
    typeof review.priceUsd === "number" ? String(review.priceUsd) : "",
  );
  const [semester, setSemester] = useState(review.semester || "");
  const [imageUrls, setImageUrls] = useState<string[]>(review.imageUrls ? [...review.imageUrls] : []);

  function resetDraft() {
    setRating(String(initialRating));
    setRecommended(review.recommended === true);
    setComment(review.comment || "");
    setPriceUsd(typeof review.priceUsd === "number" ? String(review.priceUsd) : "");
    setSemester(review.semester || "");
    setImageUrls(review.imageUrls ? [...review.imageUrls] : []);
  }

  function toggleEditing() {
    setIsEditing((current) => {
      const next = !current;
      if (next) {
        resetDraft();
      }
      return next;
    });
    setError("");
    setStatus("");
  }

  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    const selectedFiles = Array.from(files);
    const availableSlots = Math.max(0, MAX_REVIEW_IMAGE_COUNT - imageUrls.length);
    if (availableSlots === 0) {
      setError(messages.formPhotosMaxError.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT)));
      return;
    }

    const filesToUpload = selectedFiles.slice(0, availableSlots);
    if (selectedFiles.length > availableSlots) {
      setError(messages.formPhotosMaxError.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT)));
    }

    setBusy(true);
    try {
      const uploadResult = await uploadReviewImageFiles(filesToUpload);
      if (!uploadResult.ok) {
        setError(uploadResult.error);
        return;
      }

      setImageUrls((current) =>
        Array.from(new Set([...current, ...uploadResult.urls])).slice(0, MAX_REVIEW_IMAGE_COUNT),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    const parsedRating = Number(rating);
    if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      setError(messages.adminActionError);
      return;
    }
    if (!comment.trim()) {
      setError(messages.adminActionError);
      return;
    }

    setBusy(true);
    setError("");
    setStatus("");
    try {
      await apiPostJson<{ ok: boolean }>("/api/admin/reviews", {
        action: "edit",
        reviewId: review.id,
        rating: parsedRating,
        recommended,
        comment,
        priceUsd: priceUsd.trim() ? Number(priceUsd) : undefined,
        semester,
        studentName: review.studentName,
        studentContact: review.studentContact,
        studentEmail: review.studentEmail,
        shareContactInfo: review.shareContactInfo,
        reviewImageUrls: imageUrls,
      });
      setStatus(messages.adminImagesSaveSuccess);
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      setError(
        mapApiClientErrorMessage(error, {
          defaultMessage: messages.adminImagesSaveError,
          statusMessages: {
            400: messages.adminActionError,
            401: messages.adminAuthError,
          },
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="moderation-review-block">
      <button type="button" className="button-link" onClick={toggleEditing} disabled={busy}>
        {messages.adminEditReview}
      </button>
      {status ? <p className="form-status success">{status}</p> : null}
      {error ? <p className="form-status error">{error}</p> : null}

      {isEditing ? (
        <form
          className="review-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdits();
          }}
        >
          <label>
            <span>{messages.ratingLabel}</span>
            <input
              type="number"
              min={1}
              max={5}
              step={1}
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              required
            />
          </label>

          <label>
            <span>{messages.formRecommended}</span>
            <select
              value={recommended ? "yes" : "no"}
              onChange={(event) => setRecommended(event.target.value === "yes")}
            >
              <option value="yes">{messages.yes}</option>
              <option value="no">{messages.no}</option>
            </select>
          </label>

          <label>
            <span>{messages.formPriceLabel}</span>
            <input
              type="number"
              min={1}
              max={20000}
              step={1}
              value={priceUsd}
              onChange={(event) => setPriceUsd(event.target.value)}
            />
          </label>

          <label>
            <span>{messages.formSemester}</span>
            <input type="text" value={semester} onChange={(event) => setSemester(event.target.value)} />
          </label>

          <label>
            <span>{messages.formComment}</span>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} required />
          </label>

          <fieldset className="review-images">
            <legend>{messages.formReviewPhotosLabel}</legend>
            <p className="review-images__hint">
              {messages.formPhotosHint.replace("{count}", String(MAX_REVIEW_IMAGE_COUNT))}
            </p>
            {imageUrls.length > 0 ? (
              <ImageGalleryViewer
                lang={lang}
                images={imageUrls}
                altBase={messages.imageAltReview}
                ariaLabel={messages.imageAriaReviewPhotos}
              />
            ) : null}
            <label className="button-link review-images__upload">
              + {messages.formReviewPhotosLabel}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                multiple
                onChange={(event) => {
                  void uploadImages(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
                disabled={busy}
              />
            </label>
          </fieldset>

          <div className="moderation-actions">
            <button type="submit" className="button-link" disabled={busy}>
              {messages.adminImagesSave}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

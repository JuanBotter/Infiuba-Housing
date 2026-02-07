"use client";

import { FormEvent, useMemo, useState } from "react";

import { getMessages } from "@/lib/i18n";
import {
  buildReviewPayload,
  createInitialReviewDraft,
  readApiErrorMessage,
} from "@/lib/review-form";
import { SEMESTER_OPTIONS } from "@/lib/semester-options";
import { StarRating } from "@/components/star-rating";
import type { Lang } from "@/types";

interface ReviewFormProps {
  lang: Lang;
  listingId: string;
}

export function ReviewForm({ lang, listingId }: ReviewFormProps) {
  const t = useMemo(() => getMessages(lang), [lang]);
  const [reviewDraft, setReviewDraft] = useState(createInitialReviewDraft);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [serverMessage, setServerMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ratingValue = Number(reviewDraft.rating);
    const hasRating = Number.isFinite(ratingValue) && ratingValue > 0;
    const hasRecommendation =
      reviewDraft.recommended === "yes" || reviewDraft.recommended === "no";
    if (!hasRating || !hasRecommendation) {
      setStatus("error");
      setServerMessage(t.formReviewSelectionError);
      return;
    }

    setStatus("sending");
    setServerMessage("");

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
        setServerMessage(await readApiErrorMessage(response));
        setStatus("error");
        return;
      }

      setStatus("success");
      setReviewDraft(createInitialReviewDraft());
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="review-form" onSubmit={onSubmit}>
      <div className="review-rating-row">
        <StarRating
          name={`review-rating-${listingId}`}
          value={reviewDraft.rating}
          onChange={(nextValue) =>
            setReviewDraft((previous) => ({ ...previous, rating: nextValue }))
          }
          label={t.formRating}
        />

        <fieldset className="review-choice">
          <legend>{t.formRecommended}</legend>
          <label className="review-choice__option">
            <input
              type="radio"
              name={`review-recommend-${listingId}`}
              value="yes"
              checked={reviewDraft.recommended === "yes"}
              onChange={() =>
                setReviewDraft((previous) => ({ ...previous, recommended: "yes" }))
              }
            />
            <span>{t.yes}</span>
          </label>
          <label className="review-choice__option">
            <input
              type="radio"
              name={`review-recommend-${listingId}`}
              value="no"
              checked={reviewDraft.recommended === "no"}
              onChange={() =>
                setReviewDraft((previous) => ({ ...previous, recommended: "no" }))
              }
            />
            <span>{t.no}</span>
          </label>
        </fieldset>
      </div>

      <label>
        <span>{t.priceLabel}</span>
        <input
          type="number"
          min={1}
          max={20000}
          step="0.01"
          value={reviewDraft.priceUsd}
          onChange={(event) =>
            setReviewDraft((previous) => ({ ...previous, priceUsd: event.target.value }))
          }
        />
      </label>

      <label>
        <span>{t.formComment}</span>
        <textarea
          value={reviewDraft.comment}
          onChange={(event) =>
            setReviewDraft((previous) => ({ ...previous, comment: event.target.value }))
          }
          minLength={12}
          maxLength={1000}
          required
        />
      </label>

      <label>
        <span>{t.formSemester}</span>
        <input
          type="text"
          value={reviewDraft.semester}
          onChange={(event) =>
            setReviewDraft((previous) => ({ ...previous, semester: event.target.value }))
          }
          placeholder={t.formSemesterPlaceholder}
          list="semester-options"
          required
          maxLength={8}
        />
        <datalist id="semester-options">
          {SEMESTER_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </label>

      <fieldset className="contact-section">
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
            onChange={(event) =>
              setReviewDraft((previous) => ({ ...previous, studentContact: event.target.value }))
            }
            maxLength={120}
          />
        </label>

        <label>
          <span>{t.formEmail}</span>
          <input
            type="email"
            value={reviewDraft.studentEmail}
            onChange={(event) =>
              setReviewDraft((previous) => ({ ...previous, studentEmail: event.target.value }))
            }
            maxLength={120}
          />
        </label>

        <label className="consent-checkbox">
          <input
            type="checkbox"
            checked={reviewDraft.shareContactInfo}
            onChange={(event) =>
              setReviewDraft((previous) => ({
                ...previous,
                shareContactInfo: event.target.checked,
              }))
            }
          />
          <span>{t.formContactConsentLabel}</span>
          <small>{t.formContactConsentHint}</small>
        </label>
      </fieldset>

      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? t.formSending : t.formSubmit}
      </button>

      {status === "success" ? <p className="form-status success">{t.formSuccess}</p> : null}
      {status === "error" ? <p className="form-status error">{serverMessage || t.formError}</p> : null}
    </form>
  );
}

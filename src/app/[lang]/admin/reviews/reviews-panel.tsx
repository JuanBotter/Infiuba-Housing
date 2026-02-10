"use client";

import { useEffect, useMemo, useState } from "react";

import { ImageGalleryViewer } from "@/components/image-gallery-viewer";
import { formatUsd, getLocaleForLang } from "@/lib/format";
import { getMessages } from "@/lib/i18n";
import type { ApprovedWebReview, Lang, PendingWebReview } from "@/types";

interface ReviewsPanelProps {
  lang: Lang;
  listingMap: Record<string, string>;
}

interface ModerationPayload {
  pending: PendingWebReview[];
  approved: ApprovedWebReview[];
}

function formatDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(getLocaleForLang(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatOptionalValue(value?: string) {
  return value?.trim() || "-";
}

export function ReviewsPanel({ lang, listingMap }: ReviewsPanelProps) {
  const messages = useMemo(() => getMessages(lang), [lang]);
  const [pendingReviews, setPendingReviews] = useState<PendingWebReview[]>([]);
  const [approvedReviews, setApprovedReviews] = useState<ApprovedWebReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyReviewId, setBusyReviewId] = useState("");

  async function loadModerationData() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/reviews");

      if (response.status === 401) {
        setError(messages.adminAuthError);
        return;
      }
      if (!response.ok) {
        setError(messages.adminError);
        return;
      }

      const payload = (await response.json()) as ModerationPayload;
      setPendingReviews(payload.pending || []);
      setApprovedReviews((payload.approved || []).slice(0, 30));
    } catch {
      setError(messages.adminError);
    } finally {
      setLoading(false);
    }
  }

  async function moderateReview(action: "approve" | "reject", reviewId: string) {
    setBusyReviewId(reviewId);
    setError("");
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, reviewId }),
      });

      if (response.status === 401) {
        setError(messages.adminAuthError);
        return;
      }
      if (!response.ok) {
        setError(messages.adminActionError);
        return;
      }

      await loadModerationData();
    } catch {
      setError(messages.adminActionError);
    } finally {
      setBusyReviewId("");
    }
  }

  useEffect(() => {
    void loadModerationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <article className="detail-card moderation-toolbar">
        <button type="button" className="button-link" onClick={() => void loadModerationData()}>
          {loading ? messages.adminLoading : messages.adminRefresh}
        </button>
      </article>

      {error ? <p className="form-status error">{error}</p> : null}

      <section className="moderation-grid">
        <article className="detail-card">
          <h2>{messages.adminPendingTitle}</h2>
          {loading ? <p>{messages.adminLoading}</p> : null}
          {!loading && pendingReviews.length === 0 ? <p>{messages.adminEmptyPending}</p> : null}
          <ul className="review-list">
            {pendingReviews.map((review) => {
              const hasContactInfo = Boolean(
                review.studentContact?.trim() || review.studentEmail?.trim(),
              );

              return (
                <li key={review.id} className="review-item moderation-item">
                  <p className="moderation-review-title">
                    {listingMap[review.listingId] || messages.adminUnknownListing}
                  </p>
                  <p className="review-item__meta">{formatDate(review.createdAt, lang)}</p>
                  <dl className="moderation-review-fields">
                    <div>
                      <dt>{messages.ratingLabel}</dt>
                      <dd>{review.rating}/5</dd>
                    </div>
                    <div>
                      <dt>{messages.priceLabel}</dt>
                      <dd>
                        {typeof review.priceUsd === "number"
                          ? `${formatUsd(review.priceUsd, lang)} ${messages.monthSuffix}`
                          : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt>{messages.formRecommended}</dt>
                      <dd>{review.recommended ? messages.yes : messages.no}</dd>
                    </div>
                    <div>
                      <dt>{messages.formSemester}</dt>
                      <dd>{formatOptionalValue(review.semester)}</dd>
                    </div>
                    <div>
                      <dt>{messages.formReviewPhotosLabel}</dt>
                      <dd>{review.imageUrls?.length || 0}</dd>
                    </div>
                  </dl>

                  <section className="moderation-review-block">
                    <p className="moderation-review-block__title">{messages.formComment}</p>
                    <p className="moderation-review-comment">{review.comment}</p>
                  </section>

                  {review.listingImageUrls?.length ? (
                    <section className="moderation-review-block moderation-review-block--images">
                      <p className="moderation-review-block__title">
                        {messages.formListingPhotosLabel}
                      </p>
                      <ImageGalleryViewer
                        images={review.listingImageUrls}
                        altBase="Listing image"
                        ariaLabel="Listing photos"
                      />
                    </section>
                  ) : null}

                  {review.imageUrls?.length ? (
                    <section className="moderation-review-block moderation-review-block--images">
                      <p className="moderation-review-block__title">
                        {messages.formReviewPhotosLabel}
                      </p>
                      <ImageGalleryViewer
                        images={review.imageUrls}
                        altBase="Pending review image"
                        ariaLabel="Pending review photos"
                      />
                    </section>
                  ) : null}

                  <section className="moderation-review-block moderation-review-block--contact">
                    <p className="moderation-review-block__title">{messages.formContactSection}</p>
                    {hasContactInfo ? (
                      <>
                        <dl className="moderation-review-fields moderation-review-fields--contact">
                          <div>
                            <dt>{messages.formName}</dt>
                            <dd>{formatOptionalValue(review.studentName)}</dd>
                          </div>
                          <div>
                            <dt>{messages.formPhone}</dt>
                            <dd>{formatOptionalValue(review.studentContact)}</dd>
                          </div>
                          <div>
                            <dt>{messages.formEmail}</dt>
                            <dd>{formatOptionalValue(review.studentEmail)}</dd>
                          </div>
                        </dl>
                        <p className="moderation-review-share">
                          {messages.formContactConsentLabel}
                        </p>
                        <p className="moderation-review-share-value">
                          {review.shareContactInfo ? messages.yes : messages.no}
                        </p>
                      </>
                    ) : (
                      <p className="moderation-review-empty">
                        {messages.adminNoContactInfoProvided}
                      </p>
                    )}
                  </section>

                  <div className="moderation-actions">
                    <button
                      type="button"
                      className="button-link"
                      disabled={busyReviewId === review.id}
                      onClick={() => void moderateReview("approve", review.id)}
                    >
                      {messages.adminApprove}
                    </button>
                    <button
                      type="button"
                      className="button-link button-link--danger"
                      disabled={busyReviewId === review.id}
                      onClick={() => void moderateReview("reject", review.id)}
                    >
                      {messages.adminReject}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="detail-card">
          <h2>{messages.adminApprovedTitle}</h2>
          {!loading && approvedReviews.length === 0 ? <p>{messages.adminEmptyApproved}</p> : null}
          <ul className="review-list">
            {approvedReviews.map((review) => (
              <li key={review.id} className="review-item moderation-item">
                <p className="review-item__meta">
                  {listingMap[review.listingId] || messages.adminUnknownListing}
                </p>
                <p className="review-item__meta">
                  {formatDate(review.approvedAt, lang)} · {review.rating}/5 ·{" "}
                  {review.recommended ? messages.yes : messages.no}
                </p>
                <p>{review.comment}</p>
                {review.imageUrls?.length ? (
                  <ImageGalleryViewer
                    images={review.imageUrls}
                    altBase="Approved review image"
                    ariaLabel="Approved review photos"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}

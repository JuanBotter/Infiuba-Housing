"use client";

import { useEffect, useState } from "react";

import { ImageGalleryViewer } from "@/components/image-gallery-viewer";
import { apiGetJson, apiPostJson, mapApiClientErrorMessage } from "@/lib/api-client";
import { formatDateTime, formatUsdAmount } from "@/lib/format";
import type { Messages } from "@/i18n/messages";
import type { ApprovedWebReview, Lang, PendingWebReview } from "@/types";

interface ReviewsPanelProps {
  lang: Lang;
  listingMap: Record<string, string>;
  messages: Messages;
}

interface ModerationPayload {
  pending: PendingWebReview[];
  approved: ApprovedWebReview[];
  approvedTotal?: number;
  approvedLimit?: number;
  approvedOffset?: number;
}

function formatOptionalValue(value?: string) {
  return value?.trim() || "-";
}

export function ReviewsPanel({ lang, listingMap, messages }: ReviewsPanelProps) {
  const approvedPageSize = 30;
  const [pendingReviews, setPendingReviews] = useState<PendingWebReview[]>([]);
  const [approvedReviews, setApprovedReviews] = useState<ApprovedWebReview[]>([]);
  const [approvedTotal, setApprovedTotal] = useState(0);
  const [approvedOffset, setApprovedOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyReviewId, setBusyReviewId] = useState("");

  async function loadModerationData(nextApprovedOffset = approvedOffset) {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        approvedLimit: String(approvedPageSize),
        approvedOffset: String(Math.max(0, nextApprovedOffset)),
      });
      const payload = await apiGetJson<ModerationPayload>(`/api/admin/reviews?${query.toString()}`);
      setPendingReviews(payload.pending || []);
      setApprovedReviews(payload.approved || []);
      setApprovedTotal(
        typeof payload.approvedTotal === "number"
          ? payload.approvedTotal
          : (payload.approved || []).length,
      );
      setApprovedOffset(
        typeof payload.approvedOffset === "number"
          ? payload.approvedOffset
          : Math.max(0, nextApprovedOffset),
      );
    } catch (error) {
      setError(
        mapApiClientErrorMessage(error, {
          defaultMessage: messages.adminError,
          statusMessages: {
            401: messages.adminAuthError,
          },
        }),
      );
    } finally {
      setLoading(false);
    }
  }

  async function moderateReview(action: "approve" | "reject", reviewId: string) {
    setBusyReviewId(reviewId);
    setError("");
    try {
      await apiPostJson<{ ok: boolean }>("/api/admin/reviews", { action, reviewId });

      await loadModerationData(approvedOffset);
    } catch (error) {
      setError(
        mapApiClientErrorMessage(error, {
          defaultMessage: messages.adminActionError,
          statusMessages: {
            401: messages.adminAuthError,
          },
        }),
      );
    } finally {
      setBusyReviewId("");
    }
  }

  useEffect(() => {
    void loadModerationData(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approvedStart = approvedReviews.length > 0 ? approvedOffset + 1 : 0;
  const approvedEnd = approvedOffset + approvedReviews.length;
  const canLoadPreviousApproved = approvedOffset > 0;
  const canLoadNextApproved = approvedOffset + approvedReviews.length < approvedTotal;

  return (
    <>
      <article className="detail-card moderation-toolbar moderation-toolbar--admin">
        <button
          type="button"
          className="button-link"
          onClick={() => void loadModerationData(approvedOffset)}
        >
          {loading ? messages.adminLoading : messages.adminRefresh}
        </button>
      </article>

      {error ? <p className="form-status error">{error}</p> : null}

      <section className="moderation-grid">
        <article className="detail-card admin-moderation-column">
          <h2>{messages.adminPendingTitle}</h2>
          {loading ? <p>{messages.adminLoading}</p> : null}
          {!loading && pendingReviews.length === 0 ? <p>{messages.adminEmptyPending}</p> : null}
          <ul className="review-list">
            {pendingReviews.map((review) => {
              const hasContactInfo = Boolean(
                review.studentContact?.trim() || review.studentEmail?.trim(),
              );

              return (
                <li
                  key={review.id}
                  className="review-item moderation-item moderation-item--pending"
                >
                  <p className="moderation-review-title">
                    {listingMap[review.listingId] || messages.adminUnknownListing}
                  </p>
                  <p className="review-item__meta">{formatDateTime(review.createdAt, lang)}</p>
                  <dl className="moderation-review-fields">
                    <div>
                      <dt>{messages.ratingLabel}</dt>
                      <dd>{review.rating}/5</dd>
                    </div>
                    <div>
                      <dt>{messages.formPriceLabel}</dt>
                      <dd>
                        {typeof review.priceUsd === "number"
                          ? `${formatUsdAmount(review.priceUsd)} ${messages.monthSuffix}`
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

                  {review.imageUrls?.length ? (
                    <section className="moderation-review-block moderation-review-block--images">
                      <p className="moderation-review-block__title">{messages.formReviewPhotosLabel}</p>
                      <ImageGalleryViewer
                        lang={lang}
                        images={review.imageUrls}
                        altBase={messages.imageAltReview}
                        ariaLabel={messages.imageAriaReviewPhotos}
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
                        <p className="moderation-review-share">{messages.formContactConsentLabel}</p>
                        <p className="moderation-review-share-value">
                          {review.shareContactInfo ? messages.yes : messages.no}
                        </p>
                      </>
                    ) : (
                      <p className="moderation-review-empty">{messages.adminNoContactInfoProvided}</p>
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

        <article className="detail-card admin-moderation-column">
          <h2>{messages.adminApprovedTitle}</h2>
          <div className="moderation-toolbar moderation-toolbar--inline">
            <button
              type="button"
              className="button-link"
              disabled={!canLoadPreviousApproved || loading}
              onClick={() =>
                void loadModerationData(Math.max(0, approvedOffset - approvedPageSize))
              }
            >
              ←
            </button>
            <p className="review-item__meta">
              {approvedStart}-{approvedEnd}/{approvedTotal}
            </p>
            <button
              type="button"
              className="button-link"
              disabled={!canLoadNextApproved || loading}
              onClick={() => void loadModerationData(approvedOffset + approvedPageSize)}
            >
              →
            </button>
          </div>
          {!loading && approvedReviews.length === 0 ? <p>{messages.adminEmptyApproved}</p> : null}
          <ul className="review-list">
            {approvedReviews.map((review) => (
              <li key={review.id} className="review-item moderation-item moderation-item--approved">
                <p className="review-item__meta">
                  {listingMap[review.listingId] || messages.adminUnknownListing}
                </p>
                <p className="review-item__meta">
                  {formatDateTime(review.approvedAt, lang)} · {review.rating}/5 ·{" "}
                  {review.recommended ? messages.yes : messages.no}
                </p>
                <p>{review.comment}</p>
                {review.imageUrls?.length ? (
                  <ImageGalleryViewer
                    lang={lang}
                    images={review.imageUrls}
                    altBase={messages.imageAltReview}
                    ariaLabel={messages.imageAriaReviewPhotos}
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

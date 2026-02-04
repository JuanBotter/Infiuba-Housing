"use client";

import { useEffect, useMemo, useState } from "react";

import { getMessages } from "@/lib/i18n";
import type { ApprovedWebReview, Lang, PendingWebReview } from "@/types";

interface ModerationPanelProps {
  lang: Lang;
  listingMap: Record<string, string>;
}

interface ModerationPayload {
  pending: PendingWebReview[];
  approved: ApprovedWebReview[];
}

function formatDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "es" ? "es-AR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ModerationPanel({ lang, listingMap }: ModerationPanelProps) {
  const messages = useMemo(() => getMessages(lang), [lang]);
  const [adminToken, setAdminToken] = useState("");
  const [pendingReviews, setPendingReviews] = useState<PendingWebReview[]>([]);
  const [approvedReviews, setApprovedReviews] = useState<ApprovedWebReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyReviewId, setBusyReviewId] = useState("");

  async function loadModerationData() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/reviews", {
        headers: adminToken ? { "x-admin-token": adminToken } : undefined,
      });

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

  useEffect(() => {
    void loadModerationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function moderateReview(action: "approve" | "reject", reviewId: string) {
    setBusyReviewId(reviewId);
    setError("");
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminToken ? { "x-admin-token": adminToken } : {}),
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

  return (
    <>
      <article className="detail-card moderation-toolbar">
        <label>
          <span>{messages.adminTokenLabel}</span>
          <input
            type="password"
            value={adminToken}
            placeholder={messages.adminTokenPlaceholder}
            onChange={(event) => setAdminToken(event.target.value)}
          />
        </label>
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
            {pendingReviews.map((review) => (
              <li key={review.id} className="review-item moderation-item">
                <p className="review-item__meta">
                  {listingMap[review.listingId] || messages.adminUnknownListing}
                </p>
                <p className="review-item__meta">
                  {formatDate(review.createdAt, lang)} · {review.rating}/5 ·{" "}
                  {review.recommended ? messages.yes : messages.no}
                </p>
                <p>{review.comment}</p>
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
            ))}
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
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}

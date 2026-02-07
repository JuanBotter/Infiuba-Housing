"use client";

import { useEffect, useMemo, useState } from "react";

import { getLocaleForLang } from "@/lib/format";
import type { ContactEditRequest, Lang } from "@/types";
import type { Messages } from "@/i18n/messages";

interface ContactEditsPanelProps {
  lang: Lang;
  messages: Messages;
}

interface ContactEditsPayload {
  pending: ContactEditRequest[];
  history: ContactEditRequest[];
}

function formatDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(getLocaleForLang(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ContactEditsPanel({ lang, messages }: ContactEditsPanelProps) {
  const [pendingRequests, setPendingRequests] = useState<ContactEditRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<ContactEditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const pendingTitle = useMemo(() => messages.adminContactEditsPendingTitle, [messages]);
  const historyTitle = useMemo(() => messages.adminContactEditsHistoryTitle, [messages]);

  async function loadRequests() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/contact-edits");
      if (response.status === 401) {
        setError(messages.adminAuthError);
        return;
      }
      if (!response.ok) {
        setError(messages.adminContactEditsError);
        return;
      }

      const payload = (await response.json()) as ContactEditsPayload;
      setPendingRequests(payload.pending || []);
      setHistoryRequests(payload.history || []);
    } catch {
      setError(messages.adminContactEditsError);
    } finally {
      setLoading(false);
    }
  }

  async function moderateRequest(action: "approve" | "reject", requestId: string) {
    setBusyId(requestId);
    setError("");
    try {
      const response = await fetch("/api/admin/contact-edits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, requestId }),
      });

      if (response.status === 401) {
        setError(messages.adminAuthError);
        return;
      }
      if (!response.ok) {
        setError(messages.adminContactEditsActionError);
        return;
      }

      await loadRequests();
    } catch {
      setError(messages.adminContactEditsActionError);
    } finally {
      setBusyId("");
    }
  }

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <article className="detail-card moderation-toolbar">
        <button type="button" className="button-link" onClick={() => void loadRequests()}>
          {loading ? messages.adminLoading : messages.adminRefresh}
        </button>
      </article>

      {error ? <p className="form-status error">{error}</p> : null}

      <section className="moderation-grid">
        <article className="detail-card">
          <h2>{pendingTitle}</h2>
          {loading ? <p>{messages.adminLoading}</p> : null}
          {!loading && pendingRequests.length === 0 ? (
            <p>{messages.adminContactEditsEmptyPending}</p>
          ) : null}
          <ul className="review-list contact-edit-list">
            {pendingRequests.map((request) => (
              <li key={request.id} className="review-item contact-edit-item">
                <p className="review-item__meta">
                  {request.listingAddress || messages.adminUnknownListing}
                  {request.listingNeighborhood ? ` · ${request.listingNeighborhood}` : ""}
                </p>
                <p className="review-item__meta">
                  {formatDate(request.createdAt, lang)} · {request.requesterEmail}
                </p>
                <div className="contact-edit-block">
                  <p className="contact-edit-block__label">{messages.adminContactEditsCurrent}</p>
                  {request.currentContacts.length > 0 ? (
                    <ul>
                      {request.currentContacts.map((contact) => (
                        <li key={contact}>{contact}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>-</p>
                  )}
                </div>
                <div className="contact-edit-block">
                  <p className="contact-edit-block__label">{messages.adminContactEditsRequested}</p>
                  <ul>
                    {request.requestedContacts.map((contact) => (
                      <li key={contact}>{contact}</li>
                    ))}
                  </ul>
                </div>
                <div className="moderation-actions">
                  <button
                    type="button"
                    className="button-link"
                    disabled={busyId === request.id}
                    onClick={() => void moderateRequest("approve", request.id)}
                  >
                    {messages.adminApprove}
                  </button>
                  <button
                    type="button"
                    className="button-link button-link--danger"
                    disabled={busyId === request.id}
                    onClick={() => void moderateRequest("reject", request.id)}
                  >
                    {messages.adminReject}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="detail-card">
          <h2>{historyTitle}</h2>
          {!loading && historyRequests.length === 0 ? (
            <p>{messages.adminContactEditsEmptyHistory}</p>
          ) : null}
          <ul className="review-list contact-edit-list">
            {historyRequests.map((request) => (
              <li key={request.id} className="review-item contact-edit-item">
                <p className="review-item__meta">
                  {request.listingAddress || messages.adminUnknownListing}
                  {request.listingNeighborhood ? ` · ${request.listingNeighborhood}` : ""}
                </p>
                <p className="review-item__meta">
                  {formatDate(request.createdAt, lang)} · {request.requesterEmail}
                </p>
                <p className="review-item__meta">
                  {request.status === "approved"
                    ? messages.adminContactEditsApproved
                    : messages.adminContactEditsRejected}
                  {request.reviewedAt ? ` · ${formatDate(request.reviewedAt, lang)}` : ""}
                </p>
                <div className="contact-edit-block">
                  <p className="contact-edit-block__label">{messages.adminContactEditsRequested}</p>
                  <ul>
                    {request.requestedContacts.map((contact) => (
                      <li key={contact}>{contact}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import { apiGetJson, apiPostJson, mapApiClientErrorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
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

function formatCapacity(value: number | undefined, messages: Messages) {
  if (typeof value !== "number") {
    return "-";
  }
  return `${Math.round(value)} ${messages.studentsSuffix}`;
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
      const payload = await apiGetJson<ContactEditsPayload>("/api/admin/contact-edits");
      setPendingRequests(payload.pending || []);
      setHistoryRequests(payload.history || []);
    } catch (error) {
      setError(
        mapApiClientErrorMessage(error, {
          defaultMessage: messages.adminContactEditsError,
          statusMessages: {
            401: messages.adminAuthError,
          },
        }),
      );
    } finally {
      setLoading(false);
    }
  }

  async function moderateRequest(action: "approve" | "reject", requestId: string) {
    setBusyId(requestId);
    setError("");
    try {
      await apiPostJson<{ ok: boolean }>("/api/admin/contact-edits", { action, requestId });

      await loadRequests();
    } catch (error) {
      setError(
        mapApiClientErrorMessage(error, {
          defaultMessage: messages.adminContactEditsActionError,
          statusMessages: {
            401: messages.adminAuthError,
          },
        }),
      );
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
      <article className="detail-card moderation-toolbar moderation-toolbar--admin">
        <button type="button" className="button-link" onClick={() => void loadRequests()}>
          {loading ? messages.adminLoading : messages.adminRefresh}
        </button>
      </article>

      {error ? <p className="form-status error">{error}</p> : null}

      <section className="moderation-grid">
        <article className="detail-card admin-moderation-column">
          <h2>{pendingTitle}</h2>
          {loading ? <p>{messages.adminLoading}</p> : null}
          {!loading && pendingRequests.length === 0 ? (
            <p>{messages.adminContactEditsEmptyPending}</p>
          ) : null}
          <ul className="review-list contact-edit-list">
            {pendingRequests.map((request) => (
              <li key={request.id} className="review-item contact-edit-item moderation-item--pending">
                <p className="review-item__meta">
                  {request.listingAddress || messages.adminUnknownListing}
                  {request.listingNeighborhood ? ` · ${request.listingNeighborhood}` : ""}
                </p>
                <p className="review-item__meta">
                  {formatDateTime(request.createdAt, lang)} · {request.requesterEmail}
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
                  <p className="contact-edit-block__label">
                    {messages.adminContactEditsCurrentCapacity}
                  </p>
                  <p>{formatCapacity(request.currentCapacity, messages)}</p>
                </div>
                <div className="contact-edit-block">
                  <p className="contact-edit-block__label">{messages.adminContactEditsRequested}</p>
                  {request.requestedContacts.length > 0 ? (
                    <ul>
                      {request.requestedContacts.map((contact) => (
                        <li key={contact}>{contact}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>-</p>
                  )}
                </div>
                <div className="contact-edit-block">
                  <p className="contact-edit-block__label">
                    {messages.adminContactEditsRequestedCapacity}
                  </p>
                  <p>{formatCapacity(request.requestedCapacity, messages)}</p>
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

        <article className="detail-card admin-moderation-column">
          <h2>{historyTitle}</h2>
          {!loading && historyRequests.length === 0 ? (
            <p>{messages.adminContactEditsEmptyHistory}</p>
          ) : null}
          <ul className="review-list contact-edit-list">
            {historyRequests.map((request) => (
              <li
                key={request.id}
                className={`review-item contact-edit-item ${
                  request.status === "approved"
                    ? "moderation-item--approved"
                    : "moderation-item--rejected"
                }`}
              >
                <p className="review-item__meta">
                  {request.listingAddress || messages.adminUnknownListing}
                  {request.listingNeighborhood ? ` · ${request.listingNeighborhood}` : ""}
                </p>
                <p className="review-item__meta">
                  {formatDateTime(request.createdAt, lang)} · {request.requesterEmail}
                </p>
                <p className="review-item__meta">
                  {request.status === "approved"
                    ? messages.adminContactEditsApproved
                    : messages.adminContactEditsRejected}
                  {request.reviewedAt ? ` · ${formatDateTime(request.reviewedAt, lang)}` : ""}
                </p>
                <div className="contact-edit-block">
                  <p className="contact-edit-block__label">{messages.adminContactEditsRequested}</p>
                  {request.requestedContacts.length > 0 ? (
                    <ul>
                      {request.requestedContacts.map((contact) => (
                        <li key={contact}>{contact}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>-</p>
                  )}
                </div>
                <div className="contact-edit-block">
                  <p className="contact-edit-block__label">
                    {messages.adminContactEditsRequestedCapacity}
                  </p>
                  <p>{formatCapacity(request.requestedCapacity, messages)}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}

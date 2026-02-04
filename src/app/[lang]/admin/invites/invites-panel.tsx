"use client";

import { useEffect, useMemo, useState } from "react";

import { getLocaleForLang } from "@/lib/format";
import { getMessages } from "@/lib/i18n";
import type { Lang } from "@/types";

interface InviteResponsePayload {
  ok: boolean;
  created: CreatedInviteItem[];
  invalidEmails: string[];
  requestedCount: number;
}

interface CreatedInviteItem {
  email: string;
  role: "whitelisted" | "admin";
  expiresAt: string;
  inviteUrl: string;
}

interface InviteHistoryItem {
  id: number;
  email: string;
  role: "whitelisted" | "admin";
  status: "open" | "activated" | "replaced" | "expired";
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  consumedReason?: "activated" | "replaced";
  createdByEmail?: string;
}

interface InviteHistoryPayload {
  open: InviteHistoryItem[];
  activated: InviteHistoryItem[];
  replaced: InviteHistoryItem[];
  expired: InviteHistoryItem[];
}

interface InvitesPanelProps {
  lang: Lang;
}

function formatDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(getLocaleForLang(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function InvitesPanel({ lang }: InvitesPanelProps) {
  const messages = useMemo(() => getMessages(lang), [lang]);
  const [inviteEmailsInput, setInviteEmailsInput] = useState("");
  const [inviteRole, setInviteRole] = useState<"whitelisted" | "admin">("whitelisted");
  const [inviteExpiryHours, setInviteExpiryHours] = useState("168");
  const [createdByEmail, setCreatedByEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [inviteError, setInviteError] = useState("");
  const [createdInvites, setCreatedInvites] = useState<CreatedInviteItem[]>([]);
  const [invalidInviteEmails, setInvalidInviteEmails] = useState<string[]>([]);
  const [openInvites, setOpenInvites] = useState<InviteHistoryItem[]>([]);
  const [activatedInvites, setActivatedInvites] = useState<InviteHistoryItem[]>([]);
  const [replacedInvites, setReplacedInvites] = useState<InviteHistoryItem[]>([]);
  const [expiredInvites, setExpiredInvites] = useState<InviteHistoryItem[]>([]);
  const [inviteHistoryLoading, setInviteHistoryLoading] = useState(true);
  const [inviteHistoryError, setInviteHistoryError] = useState("");

  async function loadInviteHistory() {
    setInviteHistoryLoading(true);
    setInviteHistoryError("");
    try {
      const response = await fetch("/api/admin/invites?limit=300");

      if (response.status === 401) {
        setInviteHistoryError(messages.adminAuthError);
        return;
      }
      if (response.status === 503) {
        setInviteHistoryError(messages.adminInviteUnavailableError);
        return;
      }
      if (!response.ok) {
        setInviteHistoryError(messages.adminInviteHistoryError);
        return;
      }

      const payload = (await response.json()) as InviteHistoryPayload;
      setOpenInvites(payload.open || []);
      setActivatedInvites(payload.activated || []);
      setReplacedInvites(payload.replaced || []);
      setExpiredInvites(payload.expired || []);
    } catch {
      setInviteHistoryError(messages.adminInviteHistoryError);
    } finally {
      setInviteHistoryLoading(false);
    }
  }

  async function createInvite() {
    setInviteStatus("sending");
    setInviteError("");
    setCreatedInvites([]);
    setInvalidInviteEmails([]);

    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emails: inviteEmailsInput,
          role: inviteRole,
          expiresHours: Number(inviteExpiryHours),
          lang,
          createdByEmail,
        }),
      });

      if (response.status === 400) {
        setInviteStatus("error");
        setInviteError(messages.adminInviteInvalidEmailError);
        const body = (await response.json().catch(() => null)) as { invalidEmails?: string[] } | null;
        setInvalidInviteEmails(body?.invalidEmails || []);
        return;
      }
      if (response.status === 401) {
        setInviteStatus("error");
        setInviteError(messages.adminAuthError);
        return;
      }
      if (response.status === 503) {
        setInviteStatus("error");
        setInviteError(messages.adminInviteUnavailableError);
        return;
      }
      if (!response.ok) {
        setInviteStatus("error");
        setInviteError(messages.adminInviteCreateError);
        return;
      }

      const payload = (await response.json()) as InviteResponsePayload;
      setInviteStatus("success");
      setCreatedInvites(payload.created || []);
      setInvalidInviteEmails(payload.invalidEmails || []);
      await loadInviteHistory();
    } catch {
      setInviteStatus("error");
      setInviteError(messages.adminInviteCreateError);
    }
  }

  useEffect(() => {
    void loadInviteHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <article className="detail-card moderation-toolbar">
        <h2>{messages.adminInviteTitle}</h2>
        <div className="property-form">
          <label>
            <span>{messages.adminInviteStudentEmailLabel}</span>
            <input
              type="text"
              value={inviteEmailsInput}
              placeholder={messages.adminInviteStudentEmailsPlaceholder}
              onChange={(event) => setInviteEmailsInput(event.target.value)}
              maxLength={4000}
              required
            />
          </label>
          <label>
            <span>{messages.adminInviteRoleLabel}</span>
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as "whitelisted" | "admin")}
            >
              <option value="whitelisted">{messages.roleWhitelisted}</option>
              <option value="admin">{messages.roleAdmin}</option>
            </select>
          </label>
          <label>
            <span>{messages.adminInviteExpiryLabel}</span>
            <input
              type="number"
              min={1}
              max={720}
              step={1}
              value={inviteExpiryHours}
              onChange={(event) => setInviteExpiryHours(event.target.value)}
            />
          </label>
          <label>
            <span>{messages.adminInviteCreatorLabel}</span>
            <input
              type="email"
              value={createdByEmail}
              placeholder={messages.accessEmailPlaceholder}
              onChange={(event) => setCreatedByEmail(event.target.value)}
              maxLength={180}
            />
          </label>
          <button
            type="button"
            className="button-link"
            disabled={inviteStatus === "sending"}
            onClick={() => void createInvite()}
          >
            {inviteStatus === "sending"
              ? messages.adminInviteCreating
              : messages.adminInviteCreateButton}
          </button>
        </div>

        {inviteStatus === "success" && createdInvites.length > 0 ? (
          <>
            <p className="form-status success">
              {createdInvites.length} {messages.adminInviteCreatedCountLabel}
            </p>
            <ul className="review-list">
              {createdInvites.map((invite) => (
                <li key={invite.inviteUrl} className="review-item">
                  <p className="review-item__meta">
                    {invite.email} ·{" "}
                    {invite.role === "admin" ? messages.roleAdmin : messages.roleWhitelisted}
                  </p>
                  <a href={invite.inviteUrl} target="_blank" rel="noreferrer">
                    {invite.inviteUrl}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {invalidInviteEmails.length > 0 ? (
          <p className="form-status error">
            {messages.adminInviteInvalidEmailsLabel}: {invalidInviteEmails.join(", ")}
          </p>
        ) : null}
        {inviteStatus === "error" ? <p className="form-status error">{inviteError}</p> : null}
      </article>

      <article className="detail-card">
        <h2>{messages.adminInviteHistoryTitle}</h2>
        {inviteHistoryLoading ? <p>{messages.adminLoading}</p> : null}
        {inviteHistoryError ? <p className="form-status error">{inviteHistoryError}</p> : null}
        {!inviteHistoryLoading && !inviteHistoryError ? (
          <section className="moderation-grid">
            <article>
              <h3>{messages.adminInviteOpenTitle}</h3>
              {openInvites.length === 0 ? <p>{messages.adminInviteEmptyOpen}</p> : null}
              <ul className="review-list">
                {openInvites.map((invite) => (
                  <li key={invite.id} className="review-item">
                    <p className="review-item__meta">
                      {invite.email} ·{" "}
                      {invite.role === "admin" ? messages.roleAdmin : messages.roleWhitelisted}
                    </p>
                    <p className="review-item__meta">
                      {messages.adminInviteCreatedAtLabel}: {formatDate(invite.createdAt, lang)}
                    </p>
                    <p className="review-item__meta">
                      {messages.adminInviteExpiresAtLabel}: {formatDate(invite.expiresAt, lang)}
                    </p>
                    {invite.createdByEmail ? (
                      <p className="review-item__meta">
                        {messages.adminInviteCreatorLabel}: {invite.createdByEmail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
            <article>
              <h3>{messages.adminInviteActivatedTitle}</h3>
              {activatedInvites.length === 0 ? <p>{messages.adminInviteEmptyActivated}</p> : null}
              <ul className="review-list">
                {activatedInvites.map((invite) => (
                  <li key={invite.id} className="review-item">
                    <p className="review-item__meta">
                      {invite.email} ·{" "}
                      {invite.role === "admin" ? messages.roleAdmin : messages.roleWhitelisted}
                    </p>
                    <p className="review-item__meta">
                      {messages.adminInviteCreatedAtLabel}: {formatDate(invite.createdAt, lang)}
                    </p>
                    <p className="review-item__meta">
                      {messages.adminInviteActivatedAtLabel}:{" "}
                      {invite.consumedAt ? formatDate(invite.consumedAt, lang) : "-"}
                    </p>
                    {invite.createdByEmail ? (
                      <p className="review-item__meta">
                        {messages.adminInviteCreatorLabel}: {invite.createdByEmail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
            <article>
              <h3>{messages.adminInviteReplacedTitle}</h3>
              {replacedInvites.length === 0 ? <p>{messages.adminInviteEmptyReplaced}</p> : null}
              <ul className="review-list">
                {replacedInvites.map((invite) => (
                  <li key={invite.id} className="review-item">
                    <p className="review-item__meta">
                      {invite.email} ·{" "}
                      {invite.role === "admin" ? messages.roleAdmin : messages.roleWhitelisted}
                    </p>
                    <p className="review-item__meta">
                      {messages.adminInviteCreatedAtLabel}: {formatDate(invite.createdAt, lang)}
                    </p>
                    <p className="review-item__meta">
                      {messages.adminInviteReplacedAtLabel}:{" "}
                      {invite.consumedAt ? formatDate(invite.consumedAt, lang) : "-"}
                    </p>
                    {invite.createdByEmail ? (
                      <p className="review-item__meta">
                        {messages.adminInviteCreatorLabel}: {invite.createdByEmail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
            <article>
              <h3>{messages.adminInviteExpiredTitle}</h3>
              {expiredInvites.length === 0 ? <p>{messages.adminInviteEmptyExpired}</p> : null}
              <ul className="review-list">
                {expiredInvites.map((invite) => (
                  <li key={invite.id} className="review-item">
                    <p className="review-item__meta">
                      {invite.email} ·{" "}
                      {invite.role === "admin" ? messages.roleAdmin : messages.roleWhitelisted}
                    </p>
                    <p className="review-item__meta">
                      {messages.adminInviteCreatedAtLabel}: {formatDate(invite.createdAt, lang)}
                    </p>
                    <p className="review-item__meta">
                      {messages.adminInviteExpiresAtLabel}: {formatDate(invite.expiresAt, lang)}
                    </p>
                    {invite.createdByEmail ? (
                      <p className="review-item__meta">
                        {messages.adminInviteCreatorLabel}: {invite.createdByEmail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          </section>
        ) : null}
      </article>
    </>
  );
}

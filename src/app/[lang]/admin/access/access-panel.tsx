"use client";

import { useEffect, useMemo, useState } from "react";

import { getLocaleForLang } from "@/lib/format";
import { getMessages } from "@/lib/i18n";
import type { Lang } from "@/types";

interface ManagedUserItem {
  email: string;
  role: "whitelisted" | "admin";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ManagedUsersPayload {
  active: ManagedUserItem[];
  revoked: ManagedUserItem[];
}

interface AccessPanelProps {
  lang: Lang;
}

function formatDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(getLocaleForLang(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AccessPanel({ lang }: AccessPanelProps) {
  const messages = useMemo(() => getMessages(lang), [lang]);
  const [activeUsers, setActiveUsers] = useState<ManagedUserItem[]>([]);
  const [revokedUsers, setRevokedUsers] = useState<ManagedUserItem[]>([]);
  const [query, setQuery] = useState("");
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [usersStatus, setUsersStatus] = useState("");
  const [revokingEmail, setRevokingEmail] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const hasSearch = normalizedQuery.length > 0;
  const filteredActiveUsers = useMemo(
    () =>
      activeUsers.filter((user) =>
        `${user.email} ${user.role}`.toLowerCase().includes(normalizedQuery),
      ),
    [activeUsers, normalizedQuery],
  );
  const filteredRevokedUsers = useMemo(
    () =>
      revokedUsers.filter((user) =>
        `${user.email} ${user.role}`.toLowerCase().includes(normalizedQuery),
      ),
    [revokedUsers, normalizedQuery],
  );

  async function loadManagedUsers() {
    setUsersLoading(true);
    setUsersError("");
    try {
      const response = await fetch("/api/admin/users?limit=500");

      if (response.status === 401) {
        setUsersError(messages.adminAuthError);
        return;
      }
      if (response.status === 503) {
        setUsersError(messages.adminUsersUnavailableError);
        return;
      }
      if (!response.ok) {
        setUsersError(messages.adminUsersLoadError);
        return;
      }

      const payload = (await response.json()) as ManagedUsersPayload;
      setActiveUsers(payload.active || []);
      setRevokedUsers(payload.revoked || []);
    } catch {
      setUsersError(messages.adminUsersLoadError);
    } finally {
      setUsersLoading(false);
    }
  }

  async function revokeUser(email: string) {
    setRevokingEmail(email);
    setUsersError("");
    setUsersStatus("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "revoke", email }),
      });

      if (response.status === 400) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (payload?.error?.toLowerCase().includes("own account")) {
          setUsersError(messages.adminUsersCannotRevokeSelfError);
        } else {
          setUsersError(messages.adminUsersActionError);
        }
        return;
      }
      if (response.status === 401) {
        setUsersError(messages.adminAuthError);
        return;
      }
      if (response.status === 404) {
        setUsersError(messages.adminUsersNotFoundError);
        return;
      }
      if (response.status === 503) {
        setUsersError(messages.adminUsersUnavailableError);
        return;
      }
      if (!response.ok) {
        setUsersError(messages.adminUsersActionError);
        return;
      }

      setUsersStatus(messages.adminUsersRevokeSuccess);
      await loadManagedUsers();
    } catch {
      setUsersError(messages.adminUsersActionError);
    } finally {
      setRevokingEmail("");
    }
  }

  useEffect(() => {
    void loadManagedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <article className="detail-card">
      <h2>{messages.adminUsersTitle}</h2>
      <div className="admin-users-toolbar">
        <p className="property-form__hint">{messages.adminUsersSubtitle}</p>
        <button type="button" className="button-link" onClick={() => void loadManagedUsers()}>
          {usersLoading ? messages.adminLoading : messages.adminUsersRefresh}
        </button>
        <label className="admin-users-search">
          <span>{messages.adminUsersSearchLabel}</span>
          <input
            type="text"
            value={query}
            placeholder={messages.adminUsersSearchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={180}
          />
        </label>
      </div>
      {usersStatus ? <p className="form-status success">{usersStatus}</p> : null}
      {usersError ? <p className="form-status error">{usersError}</p> : null}
      {!usersLoading && !usersError ? (
        <section className="moderation-grid">
          <article>
            <h3>{messages.adminUsersActiveTitle}</h3>
            {filteredActiveUsers.length === 0 ? (
              <p>{hasSearch ? messages.adminUsersNoMatch : messages.adminUsersEmptyActive}</p>
            ) : null}
            <ul className="review-list">
              {filteredActiveUsers.map((user) => (
                <li key={user.email} className="review-item moderation-item">
                  <p className="review-item__meta">{user.email}</p>
                  <p className="review-item__meta">
                    {messages.adminUsersRoleLabel}:{" "}
                    {user.role === "admin" ? messages.roleAdmin : messages.roleWhitelisted}
                  </p>
                  <p className="review-item__meta">
                    {messages.adminUsersCreatedAtLabel}: {formatDate(user.createdAt, lang)}
                  </p>
                  <p className="review-item__meta">
                    {messages.adminUsersUpdatedAtLabel}: {formatDate(user.updatedAt, lang)}
                  </p>
                  <div className="moderation-actions">
                    <button
                      type="button"
                      className="button-link button-link--danger"
                      disabled={revokingEmail === user.email}
                      onClick={() => void revokeUser(user.email)}
                    >
                      {revokingEmail === user.email
                        ? messages.adminUsersRevoking
                        : messages.adminUsersRevokeButton}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article>
            <h3>{messages.adminUsersRevokedTitle}</h3>
            {filteredRevokedUsers.length === 0 ? (
              <p>{hasSearch ? messages.adminUsersNoMatch : messages.adminUsersEmptyRevoked}</p>
            ) : null}
            <ul className="review-list">
              {filteredRevokedUsers.map((user) => (
                <li key={user.email} className="review-item moderation-item">
                  <p className="review-item__meta">{user.email}</p>
                  <p className="review-item__meta">
                    {messages.adminUsersRoleLabel}:{" "}
                    {user.role === "admin" ? messages.roleAdmin : messages.roleWhitelisted}
                  </p>
                  <p className="review-item__meta">
                    {messages.adminUsersCreatedAtLabel}: {formatDate(user.createdAt, lang)}
                  </p>
                  <p className="review-item__meta">
                    {messages.adminUsersUpdatedAtLabel}: {formatDate(user.updatedAt, lang)}
                  </p>
                </li>
              ))}
            </ul>
          </article>
        </section>
      ) : null}
    </article>
  );
}

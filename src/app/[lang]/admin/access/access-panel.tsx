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

interface DeletedUserItem {
  email: string;
  deletedAt: string;
}

interface ManagedUsersPayload {
  users?: ManagedUserItem[];
  active: ManagedUserItem[];
  deleted: DeletedUserItem[];
}

interface UpsertUsersPayload {
  ok: boolean;
  processed: number;
  invalidEmails: string[];
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
  const [deletedUsers, setDeletedUsers] = useState<DeletedUserItem[]>([]);
  const [createEmailsInput, setCreateEmailsInput] = useState("");
  const [createRole, setCreateRole] = useState<"whitelisted" | "admin">("whitelisted");
  const [createStatus, setCreateStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [createError, setCreateError] = useState("");
  const [createCount, setCreateCount] = useState(0);
  const [invalidCreateEmails, setInvalidCreateEmails] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [usersStatus, setUsersStatus] = useState("");
  const [updatingEmail, setUpdatingEmail] = useState("");
  const [deletingEmail, setDeletingEmail] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, "whitelisted" | "admin">>({});
  const normalizedQuery = query.trim().toLowerCase();
  const hasSearch = normalizedQuery.length > 0;
  const filteredActiveUsers = useMemo(
    () =>
      activeUsers.filter((user) =>
        `${user.email} ${user.role}`.toLowerCase().includes(normalizedQuery),
      ),
    [activeUsers, normalizedQuery],
  );
  const filteredDeletedUsers = useMemo(
    () =>
      deletedUsers.filter((user) =>
        `${user.email}`.toLowerCase().includes(normalizedQuery),
      ),
    [deletedUsers, normalizedQuery],
  );
  const allUsers = useMemo(
    () => [...activeUsers],
    [activeUsers],
  );

  useEffect(() => {
    setRoleDrafts((current) => {
      const next: Record<string, "whitelisted" | "admin"> = {};
      for (const user of allUsers) {
        next[user.email] = current[user.email] ?? user.role;
      }
      return next;
    });
  }, [allUsers]);

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
      setDeletedUsers(payload.deleted || []);
    } catch {
      setUsersError(messages.adminUsersLoadError);
    } finally {
      setUsersLoading(false);
    }
  }

  async function createUsers() {
    setCreateStatus("sending");
    setCreateError("");
    setCreateCount(0);
    setInvalidCreateEmails([]);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "upsert",
          emails: createEmailsInput,
          role: createRole,
        }),
      });

      if (response.status === 400) {
        const payload = (await response.json().catch(() => null)) as
          | { invalidEmails?: string[] }
          | null;
        setCreateStatus("error");
        setCreateError(messages.adminUsersInvalidEmailError);
        setInvalidCreateEmails(payload?.invalidEmails || []);
        return;
      }
      if (response.status === 401) {
        setCreateStatus("error");
        setCreateError(messages.adminAuthError);
        return;
      }
      if (response.status === 503) {
        setCreateStatus("error");
        setCreateError(messages.adminUsersUnavailableError);
        return;
      }
      if (!response.ok) {
        setCreateStatus("error");
        setCreateError(messages.adminUsersCreateError);
        return;
      }

      const payload = (await response.json()) as UpsertUsersPayload;
      const processed = Number.isFinite(payload.processed) ? payload.processed : 0;
      setCreateStatus("success");
      setCreateCount(processed);
      setInvalidCreateEmails(payload.invalidEmails || []);
      if (processed > 0) {
        setCreateEmailsInput("");
      }
      await loadManagedUsers();
    } catch {
      setCreateStatus("error");
      setCreateError(messages.adminUsersCreateError);
    }
  }

  async function updateUser(email: string, role: "whitelisted" | "admin") {
    setUpdatingEmail(email);
    setUsersError("");
    setUsersStatus("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "updateRole", email, role }),
      });

      if (response.status === 400) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (payload?.error?.toLowerCase().includes("own account")) {
          setUsersError(messages.adminUsersCannotEditSelfError);
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

      setUsersStatus(messages.adminUsersRoleUpdatedSuccess);
      await loadManagedUsers();
    } catch {
      setUsersError(messages.adminUsersActionError);
    } finally {
      setUpdatingEmail("");
    }
  }

  async function deleteUserAccount(email: string) {
    if (!window.confirm(messages.adminUsersDeleteConfirm)) {
      return;
    }

    setDeletingEmail(email);
    setUsersError("");
    setUsersStatus("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "delete", email }),
      });

      if (response.status === 400) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (payload?.error?.toLowerCase().includes("own account")) {
          setUsersError(messages.adminUsersCannotEditSelfError);
        } else {
          setUsersError(messages.adminUsersDeleteError);
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
        setUsersError(messages.adminUsersDeleteError);
        return;
      }

      setUsersStatus(messages.adminUsersDeleteSuccess);
      await loadManagedUsers();
    } catch {
      setUsersError(messages.adminUsersDeleteError);
    } finally {
      setDeletingEmail("");
    }
  }

  useEffect(() => {
    void loadManagedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <article className="detail-card moderation-toolbar">
        <h2>{messages.adminUsersManageTitle}</h2>
        <p className="property-form__hint">{messages.adminUsersManageSubtitle}</p>
        <div className="property-form">
          <label className="property-form__full">
            <span>{messages.adminUsersCreateEmailsLabel}</span>
            <textarea
              value={createEmailsInput}
              placeholder={messages.adminUsersCreateEmailsPlaceholder}
              onChange={(event) => setCreateEmailsInput(event.target.value)}
              maxLength={4000}
              rows={3}
            />
          </label>
          <label>
            <span>{messages.adminUsersCreateRoleLabel}</span>
            <select
              value={createRole}
              onChange={(event) => setCreateRole(event.target.value as "whitelisted" | "admin")}
            >
              <option value="whitelisted">{messages.roleWhitelisted}</option>
              <option value="admin">{messages.roleAdmin}</option>
            </select>
          </label>
          <button
            type="button"
            className="button-link"
            disabled={createStatus === "sending"}
            onClick={() => void createUsers()}
          >
            {createStatus === "sending" ? messages.adminUsersCreating : messages.adminUsersCreateButton}
          </button>
        </div>
        <div className="form-status-slot" role="status" aria-live="polite">
          {createStatus === "success" ? (
            <p className="form-status success">
              {createCount} {messages.adminUsersCreatedCountLabel}
            </p>
          ) : null}
          {invalidCreateEmails.length > 0 ? (
            <p className="form-status error">
              {messages.adminUsersInvalidEmailsLabel}: {invalidCreateEmails.join(", ")}
            </p>
          ) : null}
          {createStatus === "error" ? <p className="form-status error">{createError}</p> : null}
          {createStatus === "idle" && invalidCreateEmails.length === 0 ? (
            <span className="form-status-placeholder" aria-hidden="true" />
          ) : null}
        </div>
      </article>

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
                {filteredActiveUsers.map((user) => {
                  const roleValue = roleDrafts[user.email] ?? user.role;
                  const roleChanged = roleValue !== user.role;
                  return (
                    <li key={user.email} className="review-item moderation-item">
                      <p className="review-item__meta">{user.email}</p>
                      <label className="admin-user-role">
                        <span>{messages.adminUsersRoleLabel}</span>
                        <select
                          value={roleValue}
                          onChange={(event) =>
                            setRoleDrafts((current) => ({
                              ...current,
                              [user.email]: event.target.value as "whitelisted" | "admin",
                            }))
                          }
                        >
                          <option value="whitelisted">{messages.roleWhitelisted}</option>
                          <option value="admin">{messages.roleAdmin}</option>
                        </select>
                      </label>
                      <p className="review-item__meta">
                        {messages.adminUsersCreatedAtLabel}: {formatDate(user.createdAt, lang)}
                      </p>
                      <p className="review-item__meta">
                        {messages.adminUsersUpdatedAtLabel}: {formatDate(user.updatedAt, lang)}
                      </p>
                      <div className="moderation-actions">
                        <button
                          type="button"
                          className="button-link"
                          disabled={!roleChanged || updatingEmail === user.email}
                          onClick={() => void updateUser(user.email, roleValue)}
                        >
                          {updatingEmail === user.email
                            ? messages.adminUsersUpdatingRole
                            : messages.adminUsersRoleUpdateButton}
                        </button>
                        <button
                          type="button"
                          className="button-link button-link--danger"
                          disabled={deletingEmail === user.email}
                          onClick={() => void deleteUserAccount(user.email)}
                        >
                          {deletingEmail === user.email
                            ? messages.adminUsersDeleting
                            : messages.adminUsersDeleteButton}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>

            <article>
              <h3>{messages.adminUsersDeletedTitle}</h3>
              {filteredDeletedUsers.length === 0 ? (
                <p>{hasSearch ? messages.adminUsersNoMatch : messages.adminUsersEmptyDeleted}</p>
              ) : null}
              <ul className="review-list">
                {filteredDeletedUsers.map((user) => {
                  return (
                    <li key={user.email} className="review-item moderation-item">
                      <p className="review-item__meta">{user.email}</p>
                    </li>
                  );
                })}
              </ul>
            </article>
          </section>
        ) : null}
      </article>
    </>
  );
}

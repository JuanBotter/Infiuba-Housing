"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getMessages } from "@/lib/i18n";
import type { Lang } from "@/types";

interface ActivateInviteFormProps {
  lang: Lang;
  token: string;
  inviteEmail?: string;
}

type ActivateStatus = "idle" | "sending" | "success" | "error";

export function ActivateInviteForm({ lang, token, inviteEmail }: ActivateInviteFormProps) {
  const t = useMemo(() => getMessages(lang), [lang]);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<ActivateStatus>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setStatus("error");
      setError(t.activateInviteMissingTokenError);
      return;
    }
    if (password.length < 10) {
      setStatus("error");
      setError(t.activateInvitePasswordLengthError);
      return;
    }
    if (password !== confirmPassword) {
      setStatus("error");
      setError(t.activateInvitePasswordMismatchError);
      return;
    }

    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/session/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      if (response.status === 400) {
        setStatus("error");
        setError(t.activateInvitePasswordLengthError);
        return;
      }
      if (response.status === 401) {
        setStatus("error");
        setError(t.activateInviteExpiredError);
        return;
      }
      if (response.status === 503) {
        setStatus("error");
        setError(t.activateInviteUnavailableError);
        return;
      }
      if (!response.ok) {
        setStatus("error");
        setError(t.activateInviteUnknownError);
        return;
      }

      setStatus("success");
      setError("");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        router.push(`/${lang}`);
        router.refresh();
      }, 500);
    } catch {
      setStatus("error");
      setError(t.activateInviteUnknownError);
    }
  }

  return (
    <form className="review-form" onSubmit={onSubmit}>
      {inviteEmail ? (
        <p className="activate-invite-target">
          <strong>{t.activateInviteForEmailLabel}:</strong> {inviteEmail}
        </p>
      ) : null}

      <label>
        <span>{t.accessPasswordLabel}</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t.accessPasswordPlaceholder}
          minLength={10}
          maxLength={200}
          required
        />
      </label>

      <label>
        <span>{t.activateInviteConfirmPasswordLabel}</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder={t.activateInviteConfirmPasswordPlaceholder}
          minLength={10}
          maxLength={200}
          required
        />
      </label>

      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? t.formSending : t.activateInviteSubmit}
      </button>

      {status === "success" ? <p className="form-status success">{t.activateInviteSuccess}</p> : null}
      {status === "error" ? <p className="form-status error">{error}</p> : null}
    </form>
  );
}

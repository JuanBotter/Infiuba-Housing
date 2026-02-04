"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getMessages } from "@/lib/i18n";
import type { AuthMethod, Lang, UserRole } from "@/types";

interface RoleSwitcherProps {
  lang: Lang;
  role: UserRole;
  authMethod?: AuthMethod;
  email?: string;
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18.3 20.3a7.5 7.5 0 0 0-12.6 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

type AccessStatus = "idle" | "sending" | "error";

export function RoleSwitcher({ lang, role, authMethod, email }: RoleSwitcherProps) {
  const t = useMemo(() => getMessages(lang), [lang]);
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [status, setStatus] = useState<AccessStatus>("idle");
  const [error, setError] = useState("");

  const roleLabel =
    role === "admin" ? t.roleAdmin : role === "whitelisted" ? t.roleWhitelisted : t.roleVisitor;

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessCode }),
      });

      if (response.status === 400) {
        setStatus("error");
        setError(t.accessProvideCredentialsError);
        return;
      }
      if (response.status === 401) {
        setStatus("error");
        setError(t.accessInvalidCodeError);
        return;
      }
      if (!response.ok) {
        setStatus("error");
        setError(t.accessUnknownError);
        return;
      }

      setStatus("idle");
      setAccessCode("");
      detailsRef.current?.removeAttribute("open");
      router.refresh();
    } catch {
      setStatus("error");
      setError(t.accessUnknownError);
    }
  }

  async function signOut() {
    setStatus("sending");
    setError("");

    try {
      await fetch("/api/session", { method: "DELETE" });
      setStatus("idle");
      setAccessCode("");
      detailsRef.current?.removeAttribute("open");
      router.refresh();
    } catch {
      setStatus("error");
      setError(t.accessUnknownError);
    }
  }

  return (
    <details ref={detailsRef} className="role-menu">
      <summary
        className={`top-bar__role top-bar__role--${role}`}
        aria-label={`${t.accessLabel}: ${roleLabel}`}
        title={`${t.accessLabel}: ${roleLabel}`}
      >
        <UserIcon />
      </summary>
      <div className="role-menu__popover">
        <p className="role-menu__current">
          {t.accessCurrentRoleLabel}: <strong>{roleLabel}</strong>
        </p>

        {role === "visitor" ? (
          <>
            <p className="role-menu__hint">{t.accessEmailHint}</p>
            <form
              className="role-menu__form"
              onSubmit={async (event) => {
                event.preventDefault();
                setStatus("sending");
                setError("");

                try {
                  const response = await fetch("/api/session", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ email: loginEmail, password }),
                  });

                  if (response.status === 400) {
                    setStatus("error");
                    setError(t.accessProvideCredentialsError);
                    return;
                  }
                  if (response.status === 401) {
                    setStatus("error");
                    setError(t.accessInvalidCredentialsError);
                    return;
                  }
                  if (response.status === 503) {
                    setStatus("error");
                    setError(t.accessLoginUnavailableError);
                    return;
                  }
                  if (!response.ok) {
                    setStatus("error");
                    setError(t.accessUnknownError);
                    return;
                  }

                  setStatus("idle");
                  setLoginEmail("");
                  setPassword("");
                  detailsRef.current?.removeAttribute("open");
                  router.refresh();
                } catch {
                  setStatus("error");
                  setError(t.accessUnknownError);
                }
              }}
            >
              <label>
                <span>{t.formEmail}</span>
                <input
                  type="email"
                  value={loginEmail}
                  placeholder={t.accessEmailPlaceholder}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  autoComplete="email"
                  maxLength={180}
                  required
                />
              </label>
              <label>
                <span>{t.accessPasswordLabel}</span>
                <input
                  type="password"
                  value={password}
                  placeholder={t.accessPasswordPlaceholder}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  minLength={10}
                  maxLength={200}
                  required
                />
              </label>
              <button type="submit" className="button-link" disabled={status === "sending"}>
                {status === "sending" ? t.accessSigningIn : t.accessEmailSignIn}
              </button>
            </form>

            <p className="role-menu__divider">{t.accessOrLabel}</p>

            <p className="role-menu__hint">{t.accessVisitorHint}</p>
            <form className="role-menu__form" onSubmit={submitCode}>
              <label>
                <span>{t.accessCodeLabel}</span>
                <input
                  type="password"
                  value={accessCode}
                  placeholder={t.accessCodePlaceholder}
                  onChange={(event) => setAccessCode(event.target.value)}
                  autoComplete="off"
                  maxLength={200}
                  required
                />
              </label>
              <button type="submit" className="button-link" disabled={status === "sending"}>
                {status === "sending" ? t.accessSigningIn : t.accessCodeSignIn}
              </button>
            </form>
          </>
        ) : (
          <>
            {email ? (
              <p className="role-menu__hint">
                {t.accessLoggedInAsLabel}: <strong>{email}</strong>
              </p>
            ) : authMethod === "code" ? (
              <p className="role-menu__hint">{t.accessLoggedInWithCodeLabel}</p>
            ) : null}
            <button type="button" className="button-link" onClick={() => void signOut()}>
              {t.accessSignOut}
            </button>
          </>
        )}

        {status === "error" ? <p className="form-status error">{error}</p> : null}
      </div>
    </details>
  );
}

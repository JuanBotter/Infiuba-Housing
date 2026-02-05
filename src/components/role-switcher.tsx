"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

type AccessStatus = "idle" | "sending" | "error" | "success";
type OtpStep = "request" | "verify";

export function RoleSwitcher({ lang, role, authMethod, email }: RoleSwitcherProps) {
  const t = useMemo(() => getMessages(lang), [lang]);
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [otpStep, setOtpStep] = useState<OtpStep>("request");
  const [status, setStatus] = useState<AccessStatus>("idle");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      const details = detailsRef.current;
      if (!details || !details.hasAttribute("open")) {
        return;
      }

      if (!details.contains(event.target)) {
        details.removeAttribute("open");
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const roleLabel =
    role === "admin" ? t.roleAdmin : role === "whitelisted" ? t.roleWhitelisted : t.roleVisitor;

  function resetVisitorState() {
    setOtpStep("request");
    setOtpCode("");
    setTrustDevice(false);
    setStatus("idle");
    setError("");
    setInfo("");
  }

  async function submitOtpRequest() {
    setStatus("sending");
    setError("");
    setInfo("");

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "requestOtp", email: loginEmail }),
      });

      if (response.status === 400) {
        setStatus("error");
        setError(t.accessProvideCredentialsError);
        return;
      }
      if (response.status === 403) {
        setStatus("error");
        setError(t.accessNotAllowedError);
        return;
      }
      if (response.status === 429) {
        const payload = (await response.json().catch(() => null)) as
          | { retryAfterSeconds?: number }
          | null;
        const retryAfterSeconds =
          payload && Number.isFinite(payload.retryAfterSeconds)
            ? Math.max(1, Math.floor(payload.retryAfterSeconds || 0))
            : undefined;
        setStatus("error");
        setError(
          retryAfterSeconds
            ? `${t.accessOtpRateLimitedError} (${retryAfterSeconds}s)`
            : t.accessOtpRateLimitedError,
        );
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

      const payload = (await response.json().catch(() => null)) as { email?: string } | null;
      if (payload?.email) {
        setLoginEmail(payload.email);
      }
      setOtpStep("verify");
      setStatus("success");
      setInfo(t.accessOtpSentSuccess);
    } catch {
      setStatus("error");
      setError(t.accessUnknownError);
    }
  }

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitOtpRequest();
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    setInfo("");

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "verifyOtp", email: loginEmail, otpCode, trustDevice }),
      });

      if (response.status === 400) {
        setStatus("error");
        setError(t.accessProvideCredentialsError);
        return;
      }
      if (response.status === 401) {
        setStatus("error");
        setError(t.accessOtpInvalidError);
        return;
      }
      if (response.status === 403) {
        setStatus("error");
        setError(t.accessNotAllowedError);
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

      resetVisitorState();
      setLoginEmail("");
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
    setInfo("");

    try {
      await fetch("/api/session", { method: "DELETE" });
      setStatus("idle");
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
            <p className="role-menu__hint">
              {otpStep === "request" ? t.accessOtpRequestHint : t.accessOtpVerifyHint}
            </p>
            <form className="role-menu__form" onSubmit={otpStep === "request" ? requestOtp : verifyOtp}>
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

              {otpStep === "verify" ? (
                <>
                  <label>
                    <span>{t.accessOtpCodeLabel}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={otpCode}
                      placeholder={t.accessOtpCodePlaceholder}
                      onChange={(event) => setOtpCode(event.target.value)}
                      autoComplete="one-time-code"
                      maxLength={12}
                      required
                    />
                  </label>
                  <label className="role-menu__checkbox">
                    <input
                      type="checkbox"
                      checked={trustDevice}
                      onChange={(event) => setTrustDevice(event.target.checked)}
                    />
                    <span>{t.accessTrustDeviceLabel}</span>
                  </label>
                </>
              ) : null}

              <button type="submit" className="button-link" disabled={status === "sending"}>
                {status === "sending"
                  ? t.accessSigningIn
                  : otpStep === "request"
                    ? t.accessOtpRequestButton
                    : t.accessOtpVerifyButton}
              </button>
            </form>

            {otpStep === "verify" ? (
              <button
                type="button"
                className="button-link"
                onClick={() => {
                  setOtpCode("");
                  setTrustDevice(false);
                  setOtpStep("request");
                  setStatus("idle");
                  setError("");
                  setInfo("");
                }}
              >
                {t.accessOtpBackButton}
              </button>
            ) : null}

            {otpStep === "verify" ? (
              <button
                type="button"
                className="button-link"
                disabled={status === "sending"}
                onClick={() => void submitOtpRequest()}
              >
                {t.accessOtpResendButton}
              </button>
            ) : null}

            <p className="role-menu__hint">{t.accessNeedApprovalHint}</p>
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

        {info ? <p className="form-status success">{info}</p> : null}
        {status === "error" ? <p className="form-status error">{error}</p> : null}
      </div>
    </details>
  );
}

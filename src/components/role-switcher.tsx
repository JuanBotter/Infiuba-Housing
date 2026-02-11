"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  apiPostJson,
  apiRequestJson,
  getApiClientErrorPayload,
  isApiClientError,
  mapApiClientErrorMessage,
} from "@/lib/api-client";
import { getMessages } from "@/lib/i18n";
import { useDetailsOutsideClose } from "@/lib/use-details-outside-close";
import type { Lang, UserRole } from "@/types";

interface RoleSwitcherProps {
  lang: Lang;
  role: UserRole;
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

export function RoleSwitcher({ lang, role, email }: RoleSwitcherProps) {
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

  useDetailsOutsideClose(detailsRef);

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
      const payload = await apiPostJson<{ email?: string }>("/api/session", {
        action: "requestOtp",
        email: loginEmail,
        lang,
      });
      if (payload?.email) {
        setLoginEmail(payload.email);
      }
      setOtpStep("verify");
      setStatus("success");
      setInfo(t.accessOtpSentSuccess);
    } catch (error) {
      if (isApiClientError(error) && error.status === 429) {
        const payload = getApiClientErrorPayload(error);
        const retryAfterRaw = payload?.retryAfterSeconds;
        const retryAfterSeconds =
          typeof retryAfterRaw === "number" && Number.isFinite(retryAfterRaw)
            ? Math.max(1, Math.floor(retryAfterRaw))
            : undefined;
        setStatus("error");
        setError(
          retryAfterSeconds
            ? `${t.accessOtpRateLimitedError} (${retryAfterSeconds}s)`
            : t.accessOtpRateLimitedError,
        );
        return;
      }
      setStatus("error");
      setError(
        mapApiClientErrorMessage(error, {
          defaultMessage: t.accessUnknownError,
          statusMessages: {
            400: t.accessProvideCredentialsError,
            403: t.accessNotAllowedError,
            503: t.accessLoginUnavailableError,
          },
        }),
      );
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
      await apiPostJson<{
        ok: boolean;
        role: UserRole;
        authMethod: string;
        email?: string;
        trustDevice?: boolean;
      }>("/api/session", {
        action: "verifyOtp",
        email: loginEmail,
        otpCode,
        trustDevice,
      });

      resetVisitorState();
      setLoginEmail("");
      detailsRef.current?.removeAttribute("open");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setError(
        mapApiClientErrorMessage(error, {
          defaultMessage: t.accessUnknownError,
          statusMessages: {
            400: t.accessProvideCredentialsError,
            401: t.accessOtpInvalidError,
            403: t.accessNotAllowedError,
            503: t.accessLoginUnavailableError,
          },
        }),
      );
    }
  }

  async function signOut() {
    setStatus("sending");
    setError("");
    setInfo("");

    try {
      await apiRequestJson<{ ok: boolean }>("/api/session", { method: "DELETE" });
      setStatus("idle");
      detailsRef.current?.removeAttribute("open");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setError(
        mapApiClientErrorMessage(error, {
          defaultMessage: t.accessUnknownError,
        }),
      );
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
        <div className="role-menu__header">
          <p className="role-menu__title">{t.accessLabel}</p>
          <p className="role-menu__current">
            {t.accessCurrentRoleLabel}: <strong>{roleLabel}</strong>
          </p>
        </div>

        {role === "visitor" ? (
          <>
            <p className="role-menu__hint">
              {otpStep === "request" ? t.accessOtpRequestHint : t.accessOtpVerifyHint}
            </p>
            <form className="role-menu__form" onSubmit={otpStep === "request" ? requestOtp : verifyOtp}>
              <label>
                <span>{t.accessEmailLabel}</span>
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

              <button
                type="submit"
                className="button-link role-menu__action-main"
                disabled={status === "sending"}
              >
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
                className="button-link button-link--secondary role-menu__action-secondary"
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
                className="button-link button-link--secondary role-menu__action-secondary"
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
            ) : null}
            <button
              type="button"
              className="button-link role-menu__action-main"
              onClick={() => void signOut()}
            >
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

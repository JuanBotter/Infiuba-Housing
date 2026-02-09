import { NextResponse } from "next/server";

import {
  buildRoleCookie,
  resolveOtpMagicLinkToken,
  verifyLoginOtp,
} from "@/lib/auth";
import { withNoStore } from "@/lib/http-cache";
import { isSupportedLanguage } from "@/lib/i18n";
import { getRequestNetworkFingerprint } from "@/lib/request-network";
import { recordSecurityAuditEvent } from "@/lib/security-audit";
import type { Lang } from "@/types";

function resolveRedirectLang(value: string | null): Lang {
  return value && isSupportedLanguage(value) ? value : "es";
}

function buildRedirectResponse(request: Request, lang: Lang) {
  const redirectUrl = new URL(request.url);
  redirectUrl.pathname = `/${lang}`;
  redirectUrl.search = "";
  return withNoStore(NextResponse.redirect(redirectUrl));
}

export async function GET(request: Request) {
  const networkFingerprint = getRequestNetworkFingerprint(request);
  const url = new URL(request.url);
  const lang = resolveRedirectLang(url.searchParams.get("lang"));
  const token = url.searchParams.get("token") || "";

  if (!token.trim()) {
    await recordSecurityAuditEvent({
      eventType: "auth.otp.verify",
      outcome: "invalid_request",
      networkFingerprint,
      metadata: { via: "magic_link" },
    });
    return buildRedirectResponse(request, lang);
  }

  const resolvedToken = resolveOtpMagicLinkToken(token);
  if (!resolvedToken.ok) {
    await recordSecurityAuditEvent({
      eventType: "auth.otp.verify",
      outcome: "invalid_or_expired",
      networkFingerprint,
      metadata: { via: "magic_link" },
    });
    return buildRedirectResponse(request, lang);
  }

  const verified = await verifyLoginOtp(
    resolvedToken.email,
    resolvedToken.otpCode,
    networkFingerprint,
  );
  if (!verified.ok) {
    await recordSecurityAuditEvent({
      eventType: "auth.otp.verify",
      outcome: verified.reason,
      targetEmail: resolvedToken.email,
      networkFingerprint,
      metadata: { via: "magic_link" },
    });
    return buildRedirectResponse(request, lang);
  }

  await recordSecurityAuditEvent({
    eventType: "auth.otp.verify",
    outcome: "ok",
    actorEmail: verified.email,
    targetEmail: verified.email,
    networkFingerprint,
    metadata: {
      via: "magic_link",
      role: verified.role,
      trustDevice: false,
    },
  });

  const response = buildRedirectResponse(request, lang);
  response.cookies.set(
    buildRoleCookie(verified.role, {
      authMethod: "otp",
      email: verified.email,
      trustDevice: false,
    }),
  );
  return response;
}

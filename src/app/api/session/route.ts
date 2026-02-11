import {
  buildRoleCookie,
  buildRoleCookieClear,
  getAuthSessionFromRequest,
  requestLoginOtp,
  verifyLoginOtp,
} from "@/lib/auth";
import { jsonError, requireSameOrigin } from "@/lib/api-route-helpers";
import { jsonNoStore } from "@/lib/http-cache";
import { supportedLanguages } from "@/lib/i18n";
import { getRequestNetworkFingerprint } from "@/lib/request-network";
import { asObject, parseBoolean, parseEnum, parseString } from "@/lib/request-validation";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

function buildOtpRequestAcceptedResponse(email: string) {
  return jsonNoStore({
    ok: true,
    email,
  });
}

export async function GET(request: Request) {
  const session = await getAuthSessionFromRequest(request);
  return jsonNoStore(session);
}

export async function POST(request: Request) {
  const sameOriginResponse = requireSameOrigin(request, { noStore: true });
  if (sameOriginResponse) {
    return sameOriginResponse;
  }

  const networkFingerprint = getRequestNetworkFingerprint(request);

  const payload = asObject(await request.json().catch(() => null));
  const action = parseEnum(payload?.action, ["requestOtp", "verifyOtp"] as const);
  const email = parseString(payload?.email, { lowercase: true, maxLength: 180 });
  const lang = parseEnum(payload?.lang, supportedLanguages);
  const otpCode = parseString(payload?.otpCode, { stripInnerWhitespace: true, maxLength: 24 });
  const trustDevice = parseBoolean(payload?.trustDevice);

  if (!action) {
    return jsonError("Unsupported action. Use requestOtp or verifyOtp.", {
      status: 400,
      noStore: true,
    });
  }

  if (action === "requestOtp") {
    if (!email) {
      await recordSecurityAuditEvent({
        eventType: "auth.otp.request",
        outcome: "invalid_request",
        networkFingerprint,
      });
      return jsonError("Missing email", { status: 400, noStore: true });
    }

    const requested = await requestLoginOtp(email, networkFingerprint, {
      lang,
      appOrigin: new URL(request.url).origin,
    });
    if (!requested.ok) {
      await recordSecurityAuditEvent({
        eventType: "auth.otp.request",
        outcome: requested.reason,
        targetEmail: email,
        networkFingerprint,
      });
      if (requested.reason === "db_unavailable") {
        return jsonError("Database is required for OTP login", {
          status: 503,
          noStore: true,
        });
      }
      if (requested.reason === "invalid_email") {
        return jsonError("Invalid email", { status: 400, noStore: true });
      }
      // Prevent account enumeration via request OTP response semantics.
      return buildOtpRequestAcceptedResponse(email);
    }

    await recordSecurityAuditEvent({
      eventType: "auth.otp.request",
      outcome: "ok",
      targetEmail: requested.email,
      networkFingerprint,
      metadata: { expiresAt: requested.expiresAt },
    });
    return buildOtpRequestAcceptedResponse(requested.email);
  }

  if (!email || !otpCode) {
    await recordSecurityAuditEvent({
      eventType: "auth.otp.verify",
      outcome: "invalid_request",
      targetEmail: email || null,
      networkFingerprint,
    });
    return jsonError("Missing email or OTP code", { status: 400, noStore: true });
  }

  const verified = await verifyLoginOtp(email, otpCode, networkFingerprint);
  if (!verified.ok) {
    await recordSecurityAuditEvent({
      eventType: "auth.otp.verify",
      outcome: verified.reason,
      targetEmail: email,
      networkFingerprint,
    });
    if (verified.reason === "db_unavailable") {
      return jsonError("Database is required for OTP login", {
        status: 503,
        noStore: true,
      });
    }
    if (verified.reason === "invalid_email") {
      return jsonError("Invalid email", { status: 400, noStore: true });
    }
    // Keep authentication failures generic to reduce account enumeration.
    return jsonError("Invalid or expired OTP code", { status: 401, noStore: true });
  }

  await recordSecurityAuditEvent({
    eventType: "auth.otp.verify",
    outcome: "ok",
    actorEmail: verified.email,
    targetEmail: verified.email,
    networkFingerprint,
    metadata: {
      role: verified.role,
      trustDevice,
    },
  });
  const response = jsonNoStore({
    ok: true,
    role: verified.role,
    authMethod: "otp",
    email: verified.email,
    trustDevice,
  });
  response.cookies.set(
    buildRoleCookie(verified.role, {
      authMethod: "otp",
      email: verified.email,
      trustDevice,
    }),
  );
  return response;
}

export function DELETE(request: Request) {
  const sameOriginResponse = requireSameOrigin(request, { noStore: true });
  if (sameOriginResponse) {
    return sameOriginResponse;
  }

  const response = jsonNoStore({ ok: true, role: "visitor" });
  response.cookies.set(buildRoleCookieClear());
  return response;
}

import {
  buildRoleCookie,
  buildRoleCookieClear,
  getAuthSessionFromRequest,
  requestLoginOtp,
  verifyLoginOtp,
} from "@/lib/auth";
import { jsonNoStore, withNoStore } from "@/lib/http-cache";
import { getRequestNetworkFingerprint } from "@/lib/request-network";
import { validateSameOriginRequest } from "@/lib/request-origin";
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
  const originValidation = validateSameOriginRequest(request);
  if (!originValidation.ok) {
    return withNoStore(originValidation.response);
  }

  const networkFingerprint = getRequestNetworkFingerprint(request);

  const payload = asObject(await request.json().catch(() => null));
  const action = parseEnum(payload?.action, ["requestOtp", "verifyOtp"] as const);
  const email = parseString(payload?.email, { lowercase: true, maxLength: 180 });
  const otpCode = parseString(payload?.otpCode, { stripInnerWhitespace: true, maxLength: 24 });
  const trustDevice = parseBoolean(payload?.trustDevice);

  if (!action) {
    return jsonNoStore(
      { error: "Unsupported action. Use requestOtp or verifyOtp." },
      { status: 400 },
    );
  }

  if (action === "requestOtp") {
    if (!email) {
      await recordSecurityAuditEvent({
        eventType: "auth.otp.request",
        outcome: "invalid_request",
        networkFingerprint,
      });
      return jsonNoStore({ error: "Missing email" }, { status: 400 });
    }

    const requested = await requestLoginOtp(email, networkFingerprint);
    if (!requested.ok) {
      await recordSecurityAuditEvent({
        eventType: "auth.otp.request",
        outcome: requested.reason,
        targetEmail: email,
        networkFingerprint,
      });
      if (requested.reason === "db_unavailable") {
        return jsonNoStore({ error: "Database is required for OTP login" }, { status: 503 });
      }
      if (requested.reason === "invalid_email") {
        return jsonNoStore({ error: "Invalid email" }, { status: 400 });
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
    return jsonNoStore({ error: "Missing email or OTP code" }, { status: 400 });
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
      return jsonNoStore({ error: "Database is required for OTP login" }, { status: 503 });
    }
    if (verified.reason === "invalid_email") {
      return jsonNoStore({ error: "Invalid email" }, { status: 400 });
    }
    // Keep authentication failures generic to reduce account enumeration.
    return jsonNoStore({ error: "Invalid or expired OTP code" }, { status: 401 });
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
  const originValidation = validateSameOriginRequest(request);
  if (!originValidation.ok) {
    return withNoStore(originValidation.response);
  }

  const response = jsonNoStore({ ok: true, role: "visitor" });
  response.cookies.set(buildRoleCookieClear());
  return response;
}

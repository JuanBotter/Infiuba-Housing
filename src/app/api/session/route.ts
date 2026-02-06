import { NextResponse } from "next/server";

import {
  buildRoleCookie,
  buildRoleCookieClear,
  getAuthSessionFromRequest,
  requestLoginOtp,
  verifyLoginOtp,
} from "@/lib/auth";
import { getRequestNetworkFingerprint } from "@/lib/request-network";
import { validateSameOriginRequest } from "@/lib/request-origin";

function parseEmail(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().slice(0, 180);
}

function parseOtpCode(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, "").trim().slice(0, 24);
}

function parseAction(value: unknown) {
  if (value !== "requestOtp" && value !== "verifyOtp") {
    return "";
  }

  return value;
}

function parseTrustDevice(value: unknown) {
  return value === true;
}

function buildOtpRequestAcceptedResponse(email: string) {
  return NextResponse.json({
    ok: true,
    email,
  });
}

export async function GET(request: Request) {
  const session = await getAuthSessionFromRequest(request);
  return NextResponse.json(session);
}

export async function POST(request: Request) {
  const originValidation = validateSameOriginRequest(request);
  if (!originValidation.ok) {
    return originValidation.response;
  }

  const networkFingerprint = getRequestNetworkFingerprint(request);

  const payload = await request.json().catch(() => null);
  const action = parseAction(payload?.action);
  const email = parseEmail(payload?.email);
  const otpCode = parseOtpCode(payload?.otpCode);
  const trustDevice = parseTrustDevice(payload?.trustDevice);

  if (!action) {
    return NextResponse.json(
      { error: "Unsupported action. Use requestOtp or verifyOtp." },
      { status: 400 },
    );
  }

  if (action === "requestOtp") {
    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const requested = await requestLoginOtp(email, networkFingerprint);
    if (!requested.ok) {
      if (requested.reason === "db_unavailable") {
        return NextResponse.json({ error: "Database is required for OTP login" }, { status: 503 });
      }
      if (requested.reason === "invalid_email") {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
      // Prevent account enumeration via request OTP response semantics.
      return buildOtpRequestAcceptedResponse(email);
    }

    return buildOtpRequestAcceptedResponse(requested.email);
  }

  if (!email || !otpCode) {
    return NextResponse.json({ error: "Missing email or OTP code" }, { status: 400 });
  }

  const verified = await verifyLoginOtp(email, otpCode, networkFingerprint);
  if (!verified.ok) {
    if (verified.reason === "db_unavailable") {
      return NextResponse.json({ error: "Database is required for OTP login" }, { status: 503 });
    }
    if (verified.reason === "invalid_email") {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    // Keep authentication failures generic to reduce account enumeration.
    return NextResponse.json({ error: "Invalid or expired OTP code" }, { status: 401 });
  }

  const response = NextResponse.json({
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
    return originValidation.response;
  }

  const response = NextResponse.json({ ok: true, role: "visitor" });
  response.cookies.set(buildRoleCookieClear());
  return response;
}

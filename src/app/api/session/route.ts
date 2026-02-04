import { NextResponse } from "next/server";

import {
  buildRoleCookie,
  buildRoleCookieClear,
  getAuthSessionFromRequest,
  resolveRoleForCredentials,
  resolveRoleForAccessCode,
} from "@/lib/auth";

function parseAccessCode(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 200);
}

function parseEmail(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().slice(0, 180);
}

function parsePassword(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 200);
}

export async function GET(request: Request) {
  const session = await getAuthSessionFromRequest(request);
  return NextResponse.json(session);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const accessCode = parseAccessCode(payload?.accessCode);
  const email = parseEmail(payload?.email);
  const password = parsePassword(payload?.password);

  if (accessCode) {
    const role = resolveRoleForAccessCode(accessCode);
    if (!role || role === "visitor") {
      return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, role, authMethod: "code" });
    response.cookies.set(buildRoleCookie(role, { authMethod: "code" }));
    return response;
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const role = await resolveRoleForCredentials(email, password);
  if (role === "db_unavailable") {
    return NextResponse.json(
      { error: "Database is required for email/password login" },
      { status: 503 },
    );
  }
  if (!role) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    role,
    authMethod: "password",
    email,
  });
  response.cookies.set(buildRoleCookie(role, { authMethod: "password", email }));
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true, role: "visitor" });
  response.cookies.set(buildRoleCookieClear());
  return response;
}

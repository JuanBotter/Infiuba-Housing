import { NextResponse } from "next/server";

import {
  buildRoleCookie,
  buildRoleCookieClear,
  getRoleFromRequest,
  resolveRoleForAccessCode,
} from "@/lib/auth";

function parseAccessCode(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 200);
}

export function GET(request: Request) {
  return NextResponse.json({ role: getRoleFromRequest(request) });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const accessCode = parseAccessCode(payload?.accessCode);

  if (!accessCode) {
    return NextResponse.json({ error: "Missing access code" }, { status: 400 });
  }

  const role = resolveRoleForAccessCode(accessCode);
  if (!role || role === "visitor") {
    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, role });
  response.cookies.set(buildRoleCookie(role));
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true, role: "visitor" });
  response.cookies.set(buildRoleCookieClear());
  return response;
}

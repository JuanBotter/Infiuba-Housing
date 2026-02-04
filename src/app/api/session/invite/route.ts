import { NextResponse } from "next/server";

import { activateInviteWithPassword, buildRoleCookie } from "@/lib/auth";

function parseToken(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 240);
}

function parsePassword(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 200);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const token = parseToken(payload?.token);
  const password = parsePassword(payload?.password);

  if (!token || !password) {
    return NextResponse.json({ error: "Missing token or password" }, { status: 400 });
  }

  const activated = await activateInviteWithPassword(token, password);
  if (!activated.ok) {
    if (activated.reason === "db_unavailable") {
      return NextResponse.json({ error: "Database is required" }, { status: 503 });
    }
    if (activated.reason === "invalid_password") {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    role: activated.role,
    email: activated.email,
  });
  response.cookies.set(
    buildRoleCookie(activated.role, {
      authMethod: "invite",
      email: activated.email,
    }),
  );
  return response;
}

import { NextResponse } from "next/server";

import {
  canAccessAdmin,
  getAuthSessionFromRequest,
  getManagedUsers,
  revokeUserAccess,
} from "@/lib/auth";

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 500;
  }
  return Math.max(1, Math.min(2000, Math.floor(parsed)));
}

function parseEmail(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase().slice(0, 180);
}

export async function GET(request: Request) {
  const session = await getAuthSessionFromRequest(request);
  if (!canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const users = await getManagedUsers(limit);
  if (!users.ok) {
    return NextResponse.json({ error: "Database is required" }, { status: 503 });
  }

  return NextResponse.json({
    active: users.users.filter((user) => user.isActive),
    revoked: users.users.filter((user) => !user.isActive),
  });
}

export async function POST(request: Request) {
  const session = await getAuthSessionFromRequest(request);
  if (!canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const action = payload?.action;
  const email = parseEmail(payload?.email);
  if (action !== "revoke" || !email) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (session.email && session.email === email) {
    return NextResponse.json({ error: "You cannot revoke your own account." }, { status: 400 });
  }

  const revoked = await revokeUserAccess(email);
  if (!revoked.ok) {
    if (revoked.reason === "db_unavailable") {
      return NextResponse.json({ error: "Database is required" }, { status: 503 });
    }
    if (revoked.reason === "invalid_email") {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user: revoked.user });
}


import { NextResponse } from "next/server";

import {
  canAccessAdmin,
  deleteUser,
  getAuthSessionFromRequest,
  getDeletedUsers,
  getManagedUsers,
  updateUserRole,
  upsertUsers,
} from "@/lib/auth";
import { validateSameOriginRequest } from "@/lib/request-origin";

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

function parseEmails(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\n,;]/g)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 2000);
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseRole(value: unknown): "whitelisted" | "admin" | "" {
  if (value === "whitelisted" || value === "admin") {
    return value;
  }
  return "";
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

  const deleted = await getDeletedUsers(limit);
  if (!deleted.ok) {
    return NextResponse.json({ error: "Database is required" }, { status: 503 });
  }

  return NextResponse.json({
    users: users.users,
    active: users.users.filter((user) => user.isActive),
    deleted: deleted.users,
  });
}

export async function POST(request: Request) {
  const originValidation = validateSameOriginRequest(request);
  if (!originValidation.ok) {
    return originValidation.response;
  }

  const session = await getAuthSessionFromRequest(request);
  if (!canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const selfEmail = session.email ? session.email.toLowerCase() : "";
  const payload = await request.json().catch(() => null);
  const action = payload?.action;
  const email = parseEmail(payload?.email);
  const role = parseRole(payload?.role);

  if (action === "updateRole") {
    if (!email || !role) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    if (selfEmail && selfEmail === email) {
      return NextResponse.json({ error: "You cannot modify your own account." }, { status: 400 });
    }

    const updated = await updateUserRole(email, role);
    if (!updated.ok) {
      if (updated.reason === "db_unavailable") {
        return NextResponse.json({ error: "Database is required" }, { status: 503 });
      }
      if (updated.reason === "invalid_email") {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, user: updated.user });
  }

  if (action === "delete") {
    if (!email) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    if (selfEmail && selfEmail === email) {
      return NextResponse.json({ error: "You cannot modify your own account." }, { status: 400 });
    }

    const deleted = await deleteUser(email);
    if (!deleted.ok) {
      if (deleted.reason === "db_unavailable") {
        return NextResponse.json({ error: "Database is required" }, { status: 503 });
      }
      if (deleted.reason === "invalid_email") {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "upsert") {
    const emails = parseEmails(payload?.emails ?? payload?.email);
    if (!role || emails.length === 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (selfEmail && emails.includes(selfEmail)) {
      return NextResponse.json({ error: "You cannot modify your own account." }, { status: 400 });
    }

    const invalidEmails = emails.filter((entry) => !isLikelyEmail(entry));
    const validEmails = emails.filter((entry) => isLikelyEmail(entry));
    if (validEmails.length === 0) {
      return NextResponse.json({ error: "Invalid email list", invalidEmails }, { status: 400 });
    }

    const created = await upsertUsers(validEmails, role);
    if (!created.ok) {
      return NextResponse.json({ error: "Database is required" }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      processed: created.count,
      invalidEmails,
    });
  }

  return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
}

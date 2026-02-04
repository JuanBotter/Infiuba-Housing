import { NextResponse } from "next/server";

import {
  canAccessAdmin,
  createInviteLink,
  getInviteHistory,
  getRoleFromRequestAsync,
} from "@/lib/auth";

function parseEmail(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().slice(0, 180);
}

function parseRole(value: unknown) {
  if (value === "admin" || value === "whitelisted") {
    return value;
  }
  return "whitelisted";
}

function parseExpiresHours(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(1, Math.min(24 * 30, Math.floor(parsed)));
}

function parseLang(value: unknown) {
  if (value === "es" || value === "fr" || value === "de" || value === "pt" || value === "it" || value === "no") {
    return value;
  }
  return "en";
}

function parseCreatorEmail(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseEmailList(value: unknown) {
  const raw =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.filter((entry) => typeof entry === "string").join(",")
        : "";

  const unique = [...new Set(raw.split(/[\n,;]+/g).map((entry) => entry.trim().toLowerCase()))]
    .filter(Boolean)
    .slice(0, 500);

  const validEmails: string[] = [];
  const invalidEmails: string[] = [];
  for (const email of unique) {
    if (isLikelyEmail(email)) {
      validEmails.push(email);
    } else {
      invalidEmails.push(email);
    }
  }

  return { validEmails, invalidEmails };
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 400;
  }
  return Math.max(1, Math.min(1000, Math.floor(parsed)));
}

export async function GET(request: Request) {
  if (!canAccessAdmin(await getRoleFromRequestAsync(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const history = await getInviteHistory(limit);

  if (!history.ok) {
    return NextResponse.json({ error: "Database is required" }, { status: 503 });
  }

  return NextResponse.json({
    open: history.invites.filter((invite) => invite.status === "open"),
    activated: history.invites.filter((invite) => invite.status === "activated"),
    replaced: history.invites.filter((invite) => invite.status === "replaced"),
    expired: history.invites.filter((invite) => invite.status === "expired"),
  });
}

export async function POST(request: Request) {
  if (!canAccessAdmin(await getRoleFromRequestAsync(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const email = parseEmail(payload?.email);
  const emails = parseEmailList(payload?.emails ?? payload?.email ?? "");
  const role = parseRole(payload?.role);
  const expiresHours = parseExpiresHours(payload?.expiresHours);
  const lang = parseLang(payload?.lang);
  const createdByEmail = parseCreatorEmail(payload?.createdByEmail);

  const validEmails = emails.validEmails.length > 0 ? emails.validEmails : email ? [email] : [];
  if (validEmails.length === 0) {
    return NextResponse.json(
      { error: "Missing email", invalidEmails: emails.invalidEmails },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  const createdInvites: Array<{
    email: string;
    role: "whitelisted" | "admin";
    expiresAt: string;
    inviteUrl: string;
  }> = [];
  const failedEmails = [...emails.invalidEmails];

  for (const targetEmail of validEmails) {
    const created = await createInviteLink({
      email: targetEmail,
      role,
      expiresHours,
      createdByEmail,
    });

    if (!created.ok) {
      if (created.reason === "db_unavailable") {
        return NextResponse.json({ error: "Database is required" }, { status: 503 });
      }
      failedEmails.push(targetEmail);
      continue;
    }

    createdInvites.push({
      email: created.email,
      role: created.role,
      expiresAt: created.expiresAt,
      inviteUrl: `${origin}/${lang}/activate?token=${encodeURIComponent(created.token)}`,
    });
  }

  if (createdInvites.length === 0) {
    return NextResponse.json(
      { error: "Invalid email", invalidEmails: failedEmails },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    created: createdInvites,
    invalidEmails: failedEmails,
    requestedCount: validEmails.length + emails.invalidEmails.length,
  });
}

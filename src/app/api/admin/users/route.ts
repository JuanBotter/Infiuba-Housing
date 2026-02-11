import {
  deleteUser,
  getDeletedUsers,
  getManagedUsers,
  updateUserRole,
  upsertUsers,
} from "@/lib/auth";
import { requireAdminSession, requireSameOrigin } from "@/lib/api-route-helpers";
import { jsonNoStore } from "@/lib/http-cache";
import {
  asObject,
  isLikelyEmail,
  parseBoundedInteger,
  parseDelimitedList,
  parseEnum,
  parseString,
} from "@/lib/request-validation";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

export async function GET(request: Request) {
  const adminSessionResult = await requireAdminSession(request);
  if (!adminSessionResult.ok) {
    return adminSessionResult.response;
  }

  const url = new URL(request.url);
  const limit = parseBoundedInteger(url.searchParams.get("limit"), {
    fallback: 500,
    min: 1,
    max: 2000,
  });
  const users = await getManagedUsers(limit);
  if (!users.ok) {
    return jsonNoStore({ error: "Database is required" }, { status: 503 });
  }

  const deleted = await getDeletedUsers(limit);
  if (!deleted.ok) {
    return jsonNoStore({ error: "Database is required" }, { status: 503 });
  }

  return jsonNoStore({
    users: users.users,
    active: users.users.filter((user) => user.isActive),
    deleted: deleted.users,
  });
}

export async function POST(request: Request) {
  const sameOriginResponse = requireSameOrigin(request, { noStore: true });
  if (sameOriginResponse) {
    return sameOriginResponse;
  }

  const adminSessionResult = await requireAdminSession(request);
  if (!adminSessionResult.ok) {
    return adminSessionResult.response;
  }
  const { session } = adminSessionResult;

  const selfEmail = session.email ? session.email.toLowerCase() : "";
  const payload = asObject(await request.json().catch(() => null));
  const action = payload?.action;
  const email = parseString(payload?.email, { lowercase: true, maxLength: 180 });
  const role = parseEnum(payload?.role, ["whitelisted", "admin"] as const);

  if (action === "updateRole") {
    if (!email || !role) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.update_role",
        outcome: "invalid_request",
        actorEmail: session.email,
        targetEmail: email || null,
      });
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }
    if (selfEmail && selfEmail === email) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.update_role",
        outcome: "blocked_self_target",
        actorEmail: session.email,
        targetEmail: email,
      });
      return jsonNoStore({ error: "You cannot modify your own account." }, { status: 400 });
    }

    const updated = await updateUserRole(email, role);
    if (!updated.ok) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.update_role",
        outcome: updated.reason,
        actorEmail: session.email,
        targetEmail: email,
        metadata: { role },
      });
      if (updated.reason === "db_unavailable") {
        return jsonNoStore({ error: "Database is required" }, { status: 503 });
      }
      if (updated.reason === "invalid_email") {
        return jsonNoStore({ error: "Invalid email" }, { status: 400 });
      }
      return jsonNoStore({ error: "User not found" }, { status: 404 });
    }

    await recordSecurityAuditEvent({
      eventType: "admin.user.update_role",
      outcome: "ok",
      actorEmail: session.email,
      targetEmail: email,
      metadata: { role },
    });
    return jsonNoStore({ ok: true, user: updated.user });
  }

  if (action === "delete") {
    if (!email) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.delete",
        outcome: "invalid_request",
        actorEmail: session.email,
      });
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }
    if (selfEmail && selfEmail === email) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.delete",
        outcome: "blocked_self_target",
        actorEmail: session.email,
        targetEmail: email,
      });
      return jsonNoStore({ error: "You cannot modify your own account." }, { status: 400 });
    }

    const deleted = await deleteUser(email);
    if (!deleted.ok) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.delete",
        outcome: deleted.reason,
        actorEmail: session.email,
        targetEmail: email,
      });
      if (deleted.reason === "db_unavailable") {
        return jsonNoStore({ error: "Database is required" }, { status: 503 });
      }
      if (deleted.reason === "invalid_email") {
        return jsonNoStore({ error: "Invalid email" }, { status: 400 });
      }
      return jsonNoStore({ error: "User not found" }, { status: 404 });
    }

    await recordSecurityAuditEvent({
      eventType: "admin.user.delete",
      outcome: "ok",
      actorEmail: session.email,
      targetEmail: email,
    });
    return jsonNoStore({ ok: true });
  }

  if (action === "upsert") {
    const emails = parseDelimitedList(payload?.emails ?? payload?.email, {
      lowercase: true,
      maxItems: 2000,
    });
    if (!role || emails.length === 0) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.upsert",
        outcome: "invalid_request",
        actorEmail: session.email,
        metadata: {
          role: role || null,
          submittedCount: emails.length,
        },
      });
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }

    if (selfEmail && emails.includes(selfEmail)) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.upsert",
        outcome: "blocked_self_target",
        actorEmail: session.email,
        metadata: { role, submittedCount: emails.length },
      });
      return jsonNoStore({ error: "You cannot modify your own account." }, { status: 400 });
    }

    const invalidEmails = emails.filter((entry) => !isLikelyEmail(entry));
    const validEmails = emails.filter((entry) => isLikelyEmail(entry));
    if (validEmails.length === 0) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.upsert",
        outcome: "invalid_email_list",
        actorEmail: session.email,
        metadata: {
          role,
          submittedCount: emails.length,
          invalidCount: invalidEmails.length,
        },
      });
      return jsonNoStore({ error: "Invalid email list", invalidEmails }, { status: 400 });
    }

    const created = await upsertUsers(validEmails, role);
    if (!created.ok) {
      await recordSecurityAuditEvent({
        eventType: "admin.user.upsert",
        outcome: created.reason,
        actorEmail: session.email,
        metadata: {
          role,
          submittedCount: emails.length,
          validCount: validEmails.length,
        },
      });
      return jsonNoStore({ error: "Database is required" }, { status: 503 });
    }

    await recordSecurityAuditEvent({
      eventType: "admin.user.upsert",
      outcome: "ok",
      actorEmail: session.email,
      metadata: {
        role,
        submittedCount: emails.length,
        validCount: validEmails.length,
        invalidCount: invalidEmails.length,
        processedCount: created.count,
      },
    });
    return jsonNoStore({
      ok: true,
      processed: created.count,
      invalidEmails,
    });
  }

  return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
}

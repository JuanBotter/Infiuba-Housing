import {
  canAccessAdmin,
  deleteUser,
  getAuthSessionFromRequest,
  getDeletedUsers,
  getManagedUsers,
  updateUserRole,
  upsertUsers,
} from "@/lib/auth";
import { jsonNoStore, withNoStore } from "@/lib/http-cache";
import { validateSameOriginRequest } from "@/lib/request-origin";
import {
  asObject,
  isLikelyEmail,
  parseBoundedInteger,
  parseDelimitedList,
  parseEnum,
  parseString,
} from "@/lib/request-validation";

export async function GET(request: Request) {
  const session = await getAuthSessionFromRequest(request);
  if (!canAccessAdmin(session.role)) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
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
  const originValidation = validateSameOriginRequest(request);
  if (!originValidation.ok) {
    return withNoStore(originValidation.response);
  }

  const session = await getAuthSessionFromRequest(request);
  if (!canAccessAdmin(session.role)) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  const selfEmail = session.email ? session.email.toLowerCase() : "";
  const payload = asObject(await request.json().catch(() => null));
  const action = payload?.action;
  const email = parseString(payload?.email, { lowercase: true, maxLength: 180 });
  const role = parseEnum(payload?.role, ["whitelisted", "admin"] as const);

  if (action === "updateRole") {
    if (!email || !role) {
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }
    if (selfEmail && selfEmail === email) {
      return jsonNoStore({ error: "You cannot modify your own account." }, { status: 400 });
    }

    const updated = await updateUserRole(email, role);
    if (!updated.ok) {
      if (updated.reason === "db_unavailable") {
        return jsonNoStore({ error: "Database is required" }, { status: 503 });
      }
      if (updated.reason === "invalid_email") {
        return jsonNoStore({ error: "Invalid email" }, { status: 400 });
      }
      return jsonNoStore({ error: "User not found" }, { status: 404 });
    }

    return jsonNoStore({ ok: true, user: updated.user });
  }

  if (action === "delete") {
    if (!email) {
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }
    if (selfEmail && selfEmail === email) {
      return jsonNoStore({ error: "You cannot modify your own account." }, { status: 400 });
    }

    const deleted = await deleteUser(email);
    if (!deleted.ok) {
      if (deleted.reason === "db_unavailable") {
        return jsonNoStore({ error: "Database is required" }, { status: 503 });
      }
      if (deleted.reason === "invalid_email") {
        return jsonNoStore({ error: "Invalid email" }, { status: 400 });
      }
      return jsonNoStore({ error: "User not found" }, { status: 404 });
    }

    return jsonNoStore({ ok: true });
  }

  if (action === "upsert") {
    const emails = parseDelimitedList(payload?.emails ?? payload?.email, {
      lowercase: true,
      maxItems: 2000,
    });
    if (!role || emails.length === 0) {
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }

    if (selfEmail && emails.includes(selfEmail)) {
      return jsonNoStore({ error: "You cannot modify your own account." }, { status: 400 });
    }

    const invalidEmails = emails.filter((entry) => !isLikelyEmail(entry));
    const validEmails = emails.filter((entry) => isLikelyEmail(entry));
    if (validEmails.length === 0) {
      return jsonNoStore({ error: "Invalid email list", invalidEmails }, { status: 400 });
    }

    const created = await upsertUsers(validEmails, role);
    if (!created.ok) {
      return jsonNoStore({ error: "Database is required" }, { status: 503 });
    }

    return jsonNoStore({
      ok: true,
      processed: created.count,
      invalidEmails,
    });
  }

  return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
}

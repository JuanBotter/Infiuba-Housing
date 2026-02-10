import { getAuthSessionFromRequest } from "@/lib/auth";
import { isDatabaseEnabled } from "@/lib/db";
import { getFavoriteListingIdsForUser, setListingFavoriteForUser } from "@/lib/favorites";
import { jsonNoStore, withNoStore } from "@/lib/http-cache";
import { validateSameOriginRequest } from "@/lib/request-origin";
import { asObject, parseEnum, parseString } from "@/lib/request-validation";

function getAuthenticatedEmail(session: Awaited<ReturnType<typeof getAuthSessionFromRequest>>) {
  if (session.authMethod !== "otp") {
    return "";
  }
  return typeof session.email === "string" ? session.email.trim().toLowerCase() : "";
}

export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return jsonNoStore({ error: "Database is required" }, { status: 503 });
  }

  const session = await getAuthSessionFromRequest(request);
  const email = getAuthenticatedEmail(session);
  if (!email) {
    return jsonNoStore({ ok: true, loggedIn: false, listingIds: [] });
  }

  const result = await getFavoriteListingIdsForUser(email);
  if (!result.ok) {
    if (result.reason === "schema_missing") {
      return jsonNoStore(
        { error: "Favorites are unavailable until database migrations are applied" },
        { status: 503 },
      );
    }
    return jsonNoStore({ error: "Could not load favorites" }, { status: 400 });
  }

  return jsonNoStore({
    ok: true,
    loggedIn: true,
    listingIds: result.listingIds,
  });
}

export async function POST(request: Request) {
  const originValidation = validateSameOriginRequest(request);
  if (!originValidation.ok) {
    return withNoStore(originValidation.response);
  }

  if (!isDatabaseEnabled()) {
    return jsonNoStore({ error: "Database is required" }, { status: 503 });
  }

  const session = await getAuthSessionFromRequest(request);
  const email = getAuthenticatedEmail(session);
  if (!email) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = asObject(await request.json().catch(() => null));
  const action = parseEnum(payload?.action, ["add", "remove"] as const);
  const listingId = parseString(payload?.listingId, { maxLength: 200 });

  if (!action || !listingId) {
    return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await setListingFavoriteForUser(email, listingId, action === "add");
  if (!result.ok) {
    if (result.reason === "not_found") {
      return jsonNoStore({ error: "Listing not found" }, { status: 404 });
    }
    if (result.reason === "schema_missing") {
      return jsonNoStore(
        { error: "Favorites are unavailable until database migrations are applied" },
        { status: 503 },
      );
    }
    return jsonNoStore({ error: "Could not update favorite" }, { status: 400 });
  }

  return jsonNoStore({
    ok: true,
    listingId: result.listingId,
    favorite: result.favorite,
  });
}

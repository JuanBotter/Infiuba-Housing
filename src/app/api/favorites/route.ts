import { getAuthSessionFromRequest } from "@/lib/auth";
import { jsonError, requireDb, requireSameOrigin } from "@/lib/api-route-helpers";
import { getFavoriteListingIdsForUser, setListingFavoriteForUser } from "@/lib/favorites";
import { jsonNoStore } from "@/lib/http-cache";
import { asObject, parseEnum, parseString } from "@/lib/request-validation";

function getAuthenticatedEmail(session: Awaited<ReturnType<typeof getAuthSessionFromRequest>>) {
  if (session.authMethod !== "otp") {
    return "";
  }
  return typeof session.email === "string" ? session.email.trim().toLowerCase() : "";
}

export async function GET(request: Request) {
  const dbResponse = requireDb({ noStore: true });
  if (dbResponse) {
    return dbResponse;
  }

  const session = await getAuthSessionFromRequest(request);
  const email = getAuthenticatedEmail(session);
  if (!email) {
    return jsonNoStore({ ok: true, loggedIn: false, listingIds: [] });
  }

  const result = await getFavoriteListingIdsForUser(email);
  if (!result.ok) {
    if (result.reason === "schema_missing") {
      return jsonError("Favorites are unavailable until database migrations are applied", {
        status: 503,
        noStore: true,
      });
    }
    return jsonError("Could not load favorites", { status: 400, noStore: true });
  }

  return jsonNoStore({
    ok: true,
    loggedIn: true,
    listingIds: result.listingIds,
  });
}

export async function POST(request: Request) {
  const sameOriginResponse = requireSameOrigin(request, { noStore: true });
  if (sameOriginResponse) {
    return sameOriginResponse;
  }

  const dbResponse = requireDb({ noStore: true });
  if (dbResponse) {
    return dbResponse;
  }

  const session = await getAuthSessionFromRequest(request);
  const email = getAuthenticatedEmail(session);
  if (!email) {
    return jsonError("Unauthorized", { status: 401, noStore: true });
  }

  const payload = asObject(await request.json().catch(() => null));
  const action = parseEnum(payload?.action, ["add", "remove"] as const);
  const listingId = parseString(payload?.listingId, { maxLength: 200 });

  if (!action || !listingId) {
    return jsonError("Invalid payload", { status: 400, noStore: true });
  }

  const result = await setListingFavoriteForUser(email, listingId, action === "add");
  if (!result.ok) {
    if (result.reason === "not_found") {
      return jsonError("Listing not found", { status: 404, noStore: true });
    }
    if (result.reason === "schema_missing") {
      return jsonError("Favorites are unavailable until database migrations are applied", {
        status: 503,
        noStore: true,
      });
    }
    return jsonError("Could not update favorite", { status: 400, noStore: true });
  }

  return jsonNoStore({
    ok: true,
    listingId: result.listingId,
    favorite: result.favorite,
  });
}

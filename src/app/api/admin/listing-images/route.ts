import { revalidateTag } from "next/cache";

import {
  getAdminListingImageDetail,
  getAdminListingImageSummaries,
  setAdminListingImageOrder,
} from "@/lib/admin-listing-images";
import { canAccessAdmin, getAuthSessionFromRequest, getRoleFromRequestAsync } from "@/lib/auth";
import { isDatabaseEnabled } from "@/lib/db";
import { jsonNoStore, withNoStore } from "@/lib/http-cache";
import { validateSameOriginRequest } from "@/lib/request-origin";
import { asObject, parseString } from "@/lib/request-validation";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

function parseOrderedImageUrls(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (normalized.length !== value.length) {
    return null;
  }

  return normalized;
}

export async function GET(request: Request) {
  if (!canAccessAdmin(await getRoleFromRequestAsync(request))) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseEnabled()) {
    return jsonNoStore({ error: "Database is required" }, { status: 503 });
  }

  const url = new URL(request.url);
  const listingId = parseString(url.searchParams.get("listingId"), {
    maxLength: 200,
  });

  if (!listingId) {
    const listings = await getAdminListingImageSummaries();
    return jsonNoStore({ listings });
  }

  const detailResult = await getAdminListingImageDetail(listingId);
  if (!detailResult.ok) {
    return jsonNoStore({ error: "Listing not found" }, { status: 404 });
  }

  return jsonNoStore(detailResult.detail);
}

export async function POST(request: Request) {
  const originValidation = validateSameOriginRequest(request);
  if (!originValidation.ok) {
    return withNoStore(originValidation.response);
  }

  if (!canAccessAdmin(await getRoleFromRequestAsync(request))) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseEnabled()) {
    return jsonNoStore({ error: "Database is required" }, { status: 503 });
  }

  const session = await getAuthSessionFromRequest(request);
  const payload = asObject(await request.json().catch(() => null));
  const listingId = parseString(payload?.listingId, { maxLength: 200 });
  const orderedImageUrls = parseOrderedImageUrls(payload?.orderedImageUrls);

  if (!listingId || !orderedImageUrls) {
    await recordSecurityAuditEvent({
      eventType: "admin.listing_images.reorder",
      outcome: "invalid_request",
      actorEmail: session.email,
      metadata: {
        listingId: listingId || null,
      },
    });
    return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await setAdminListingImageOrder(listingId, orderedImageUrls);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 400;
    const error =
      result.reason === "not_found" ? "Listing not found" : "Invalid image selection";

    await recordSecurityAuditEvent({
      eventType: "admin.listing_images.reorder",
      outcome: result.reason,
      actorEmail: session.email,
      metadata: {
        listingId,
      },
    });

    return jsonNoStore({ error }, { status });
  }

  await recordSecurityAuditEvent({
    eventType: "admin.listing_images.reorder",
    outcome: "ok",
    actorEmail: session.email,
    metadata: {
      listingId: result.listingId,
      imageCount: result.orderedImages.length,
    },
  });

  revalidateTag("public-listings", "max");
  revalidateTag(`public-listing:${result.listingId}`, "max");

  return jsonNoStore({ ok: true, listingId: result.listingId, orderedImages: result.orderedImages });
}

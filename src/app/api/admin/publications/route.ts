import {
  deleteAdminListingImage,
  getAdminListingImageDetail,
  getAdminListingImageSummaries,
  setAdminListingImageOrder,
  updateAdminListingDetails,
} from "@/lib/admin-listing-images";
import { requireAdminSession, requireDb, requireSameOrigin } from "@/lib/api-route-helpers";
import {
  revalidatePublicListing,
  revalidatePublicListingWithApprovedReviews,
} from "@/lib/cache-tags";
import {
  LISTING_ADDRESS_MAX_LENGTH,
  LISTING_ID_MAX_LENGTH,
  LISTING_NEIGHBORHOOD_MAX_LENGTH,
  parseListingContactsFromUnknown,
  toOptionalNumber,
} from "@/lib/domain-constraints";
import { jsonNoStore } from "@/lib/http-cache";
import { asObject, parseString } from "@/lib/request-validation";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

type AdminPublicationAction = "saveImageOrder" | "updatePublication" | "deleteImage";

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

function resolveAction(rawAction: string): AdminPublicationAction | "" {
  if (!rawAction) {
    return "saveImageOrder";
  }
  if (rawAction === "saveImageOrder") {
    return rawAction;
  }
  if (rawAction === "updatePublication") {
    return rawAction;
  }
  if (rawAction === "deleteImage") {
    return rawAction;
  }
  return "";
}

export async function GET(request: Request) {
  const adminSessionResult = await requireAdminSession(request);
  if (!adminSessionResult.ok) {
    return adminSessionResult.response;
  }

  const dbResponse = requireDb({ noStore: true });
  if (dbResponse) {
    return dbResponse;
  }

  const url = new URL(request.url);
  const listingId = parseString(url.searchParams.get("listingId"), {
    maxLength: LISTING_ID_MAX_LENGTH,
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
  const sameOriginResponse = requireSameOrigin(request, { noStore: true });
  if (sameOriginResponse) {
    return sameOriginResponse;
  }

  const adminSessionResult = await requireAdminSession(request);
  if (!adminSessionResult.ok) {
    return adminSessionResult.response;
  }
  const { session } = adminSessionResult;

  const dbResponse = requireDb({ noStore: true });
  if (dbResponse) {
    return dbResponse;
  }
  const payload = asObject(await request.json().catch(() => null));
  const action = resolveAction(parseString(payload?.action, { maxLength: 40 }));
  const listingId = parseString(payload?.listingId, { maxLength: LISTING_ID_MAX_LENGTH });

  if (!action || !listingId) {
    await recordSecurityAuditEvent({
      eventType: "admin.publication.update",
      outcome: "invalid_request",
      actorEmail: session.email,
      metadata: {
        action: action || null,
        listingId: listingId || null,
      },
    });
    return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
  }

  if (action === "saveImageOrder") {
    const orderedImageUrls = parseOrderedImageUrls(payload?.orderedImageUrls);
    if (!orderedImageUrls) {
      await recordSecurityAuditEvent({
        eventType: "admin.listing_images.reorder",
        outcome: "invalid_request",
        actorEmail: session.email,
        metadata: { listingId },
      });
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }

    const result = await setAdminListingImageOrder(listingId, orderedImageUrls);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 400;
      await recordSecurityAuditEvent({
        eventType: "admin.listing_images.reorder",
        outcome: result.reason,
        actorEmail: session.email,
        metadata: { listingId },
      });
      return jsonNoStore({ error: "Could not update image order" }, { status });
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

    revalidatePublicListing(result.listingId);

    return jsonNoStore({ ok: true, listingId: result.listingId, orderedImages: result.orderedImages });
  }

  if (action === "updatePublication") {
    const address = parseString(payload?.address, { maxLength: LISTING_ADDRESS_MAX_LENGTH });
    const neighborhood = parseString(payload?.neighborhood, {
      maxLength: LISTING_NEIGHBORHOOD_MAX_LENGTH,
    });
    const contacts = parseListingContactsFromUnknown(payload?.contacts);
    const capacity = toOptionalNumber(payload?.capacity);

    if (!address || !neighborhood || !contacts) {
      await recordSecurityAuditEvent({
        eventType: "admin.publication.update",
        outcome: "invalid_request",
        actorEmail: session.email,
        metadata: { listingId },
      });
      return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
    }

    const result = await updateAdminListingDetails(listingId, {
      address,
      neighborhood,
      capacity,
      contacts,
    });

    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 400;
      await recordSecurityAuditEvent({
        eventType: "admin.publication.update",
        outcome: result.reason,
        actorEmail: session.email,
        metadata: { listingId },
      });
      return jsonNoStore({ error: "Could not update publication details" }, { status });
    }

    await recordSecurityAuditEvent({
      eventType: "admin.publication.update",
      outcome: "ok",
      actorEmail: session.email,
      metadata: { listingId: result.listingId },
    });

    revalidatePublicListing(result.listingId);

    return jsonNoStore({ ok: true, listingId: result.listingId });
  }

  const imageUrl = parseString(payload?.imageUrl, { maxLength: 2048 });
  if (!imageUrl) {
    await recordSecurityAuditEvent({
      eventType: "admin.publication.delete_image",
      outcome: "invalid_request",
      actorEmail: session.email,
      metadata: { listingId },
    });
    return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await deleteAdminListingImage(listingId, imageUrl);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 400;
    await recordSecurityAuditEvent({
      eventType: "admin.publication.delete_image",
      outcome: result.reason,
      actorEmail: session.email,
      metadata: { listingId },
    });
    return jsonNoStore({ error: "Could not delete image" }, { status });
  }

  await recordSecurityAuditEvent({
    eventType: "admin.publication.delete_image",
    outcome: "ok",
    actorEmail: session.email,
    metadata: {
      listingId: result.listingId,
      removedCount: result.removedCount,
    },
  });

  revalidatePublicListingWithApprovedReviews(result.listingId);

  return jsonNoStore({
    ok: true,
    listingId: result.listingId,
    orderedImages: result.orderedImages,
    removedCount: result.removedCount,
  });
}

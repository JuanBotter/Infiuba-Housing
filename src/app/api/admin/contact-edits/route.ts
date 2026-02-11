import { dbQuery, withTransaction } from "@/lib/db";

import { requireAdminSession, requireDb, requireSameOrigin } from "@/lib/api-route-helpers";
import { revalidatePublicListing } from "@/lib/cache-tags";
import { jsonNoStore } from "@/lib/http-cache";
import { asObject, parseString } from "@/lib/request-validation";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

interface ContactEditRow {
  id: number;
  listing_id: string;
  address: string | null;
  neighborhood: string | null;
  requester_email: string;
  requested_contacts: string[];
  current_contacts: string[];
  requested_capacity: number | null;
  current_capacity: number | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_email: string | null;
}

function mapRow(row: ContactEditRow) {
  return {
    id: String(row.id),
    listingId: row.listing_id,
    listingAddress: row.address || "",
    listingNeighborhood: row.neighborhood || "",
    requesterEmail: row.requester_email,
    requestedContacts: row.requested_contacts ?? [],
    currentContacts: row.current_contacts ?? [],
    requestedCapacity:
      typeof row.requested_capacity === "number" ? row.requested_capacity : undefined,
    currentCapacity: typeof row.current_capacity === "number" ? row.current_capacity : undefined,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewedByEmail: row.reviewed_by_email ?? undefined,
  };
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

  const result = await dbQuery<ContactEditRow>(
    `
      SELECT
        req.id,
        req.listing_id,
        req.requester_email,
        req.requested_contacts,
        req.current_contacts,
        req.requested_capacity,
        req.current_capacity,
        req.status,
        req.created_at,
        req.reviewed_at,
        req.reviewed_by_email,
        listings.address,
        listings.neighborhood
      FROM listing_contact_edit_requests req
      LEFT JOIN listings ON listings.id = req.listing_id
      ORDER BY req.created_at DESC
      LIMIT 200
    `,
  );

  const pending = result.rows.filter((row) => row.status === "pending").map(mapRow);
  const history = result.rows
    .filter((row) => row.status !== "pending")
    .slice(0, 60)
    .map(mapRow);

  return jsonNoStore({ pending, history });
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
  if (!session.email) {
    return jsonNoStore({ error: "Email required" }, { status: 401 });
  }

  const payload = asObject(await request.json().catch(() => null));
  const action = parseString(payload?.action, { maxLength: 20 });
  const requestIdRaw = parseString(payload?.requestId, { maxLength: 40 });
  const requestId = Number(requestIdRaw);

  if (
    !requestIdRaw ||
    !Number.isFinite(requestId) ||
    requestId <= 0 ||
    (action !== "approve" && action !== "reject")
  ) {
    return jsonNoStore({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await withTransaction(async (client) => {
      const requestRow = await client.query<ContactEditRow>(
        `
          SELECT
            id,
            listing_id,
            requester_email,
            requested_contacts,
            current_contacts,
            requested_capacity,
            current_capacity,
            status,
            created_at,
            reviewed_at,
            reviewed_by_email,
            NULL::text AS address,
            NULL::text AS neighborhood
          FROM listing_contact_edit_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [requestId],
      );

      const requestItem = requestRow.rows[0];
      if (!requestItem) {
        return { ok: false, status: 404 as const };
      }
      if (requestItem.status !== "pending") {
        return { ok: false, status: 409 as const, request: requestItem };
      }

      if (action === "approve") {
        const shouldUpdateContacts = requestItem.requested_contacts.length > 0;
        const shouldUpdateCapacity = requestItem.requested_capacity !== null;

        if (shouldUpdateContacts) {
        await client.query(`DELETE FROM listing_contacts WHERE listing_id = $1`, [
          requestItem.listing_id,
        ]);
        await client.query(
          `
            INSERT INTO listing_contacts (listing_id, contact)
            SELECT $1, contact
            FROM UNNEST($2::text[]) AS contact
          `,
          [requestItem.listing_id, requestItem.requested_contacts],
        );
        }

        if (shouldUpdateCapacity) {
          await client.query(
            `UPDATE listings SET capacity = $2, updated_at = NOW() WHERE id = $1`,
            [requestItem.listing_id, requestItem.requested_capacity],
          );
        } else if (shouldUpdateContacts) {
          await client.query(`UPDATE listings SET updated_at = NOW() WHERE id = $1`, [
            requestItem.listing_id,
          ]);
        }
      }

      await client.query(
        `
          UPDATE listing_contact_edit_requests
          SET status = $2,
              reviewed_at = NOW(),
              reviewed_by_email = $3
          WHERE id = $1
        `,
        [requestId, action === "approve" ? "approved" : "rejected", session.email],
      );

      return { ok: true, request: requestItem };
    });

    if (!result.ok) {
      return jsonNoStore(
        { error: result.status === 404 ? "Not found" : "Request already reviewed" },
        { status: result.status },
      );
    }

    await recordSecurityAuditEvent({
      eventType: "contact_edit.moderate",
      outcome: action === "approve" ? "approved" : "rejected",
      actorEmail: session.email,
      targetEmail: result.request?.requester_email,
      metadata: {
        requestId,
        listingId: result.request?.listing_id,
      },
    });

    if (action === "approve" && result.request?.listing_id) {
      revalidatePublicListing(result.request.listing_id);
    }

    return jsonNoStore({ ok: true });
  } catch {
    return jsonNoStore({ error: "Could not update request" }, { status: 500 });
  }
}

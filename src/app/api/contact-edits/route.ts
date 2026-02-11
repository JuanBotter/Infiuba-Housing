import { NextResponse } from "next/server";

import { canSubmitReviews, getAuthSessionFromRequest, getRoleFromRequestAsync } from "@/lib/auth";
import { dbQuery, isDatabaseEnabled } from "@/lib/db";
import {
  LISTING_CONTACT_MAX_LENGTH,
  LISTING_ID_MAX_LENGTH,
  hasListingContactTooLong,
  isValidListingCapacity,
  parseListingContactsFromDelimited,
} from "@/lib/domain-constraints";
import {
  asObject,
  parseOptionalNumber,
  parseString,
} from "@/lib/request-validation";
import { validateSameOriginRequest } from "@/lib/request-origin";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

function parseContacts(value: unknown) {
  const parsedContacts = parseListingContactsFromDelimited(value);
  const hasContactTooLong = hasListingContactTooLong(parsedContacts);
  return {
    contacts: parsedContacts,
    hasContactTooLong,
  };
}

export async function POST(request: Request) {
  try {
    const originValidation = validateSameOriginRequest(request);
    if (!originValidation.ok) {
      return originValidation.response;
    }

    const role = await getRoleFromRequestAsync(request);
    if (!canSubmitReviews(role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isDatabaseEnabled()) {
      return NextResponse.json({ error: "Database is required" }, { status: 503 });
    }

    const session = await getAuthSessionFromRequest(request);
    if (!session.email) {
      return NextResponse.json({ error: "Email required" }, { status: 401 });
    }

    const payload = asObject(await request.json().catch(() => null));
    const listingId = parseString(payload?.listingId, { maxLength: LISTING_ID_MAX_LENGTH });
    const rawContacts = parseString(payload?.contacts, { maxLength: 2000 });
    const capacityValue = parseOptionalNumber(payload?.capacity);

    if (!listingId) {
      return NextResponse.json({ error: "Missing listing" }, { status: 400 });
    }

    if (!isValidListingCapacity(capacityValue)) {
      return NextResponse.json({ error: "Invalid capacity value" }, { status: 400 });
    }

    const { contacts, hasContactTooLong } = parseContacts(rawContacts);
    if (contacts.length === 0 && capacityValue === undefined) {
      return NextResponse.json({ error: "Contact info or capacity is required" }, { status: 400 });
    }
    if (contacts.length > 0 && hasContactTooLong) {
      return NextResponse.json(
        { error: `Each contact must be at most ${LISTING_CONTACT_MAX_LENGTH} characters` },
        { status: 400 },
      );
    }

    const listingResult = await dbQuery<{
      address: string;
      neighborhood: string;
      capacity: number | null;
    }>(
      `SELECT address, neighborhood, capacity FROM listings WHERE id = $1`,
      [listingId],
    );
    if (listingResult.rowCount === 0) {
      return NextResponse.json({ error: "Listing not found" }, { status: 400 });
    }

    const currentContactsResult = await dbQuery<{ contact: string }>(
      `SELECT contact FROM listing_contacts WHERE listing_id = $1 ORDER BY id`,
      [listingId],
    );
    const currentContacts = currentContactsResult.rows.map((row) => row.contact);
    const currentCapacity = listingResult.rows[0]?.capacity ?? null;

    await dbQuery(
      `
        INSERT INTO listing_contact_edit_requests (
          listing_id,
          requester_email,
          requested_contacts,
          current_contacts,
          requested_capacity,
          current_capacity,
          status
        )
        VALUES ($1, $2, $3::text[], $4::text[], $5, $6, 'pending')
      `,
      [listingId, session.email, contacts, currentContacts, capacityValue ?? null, currentCapacity],
    );

    await recordSecurityAuditEvent({
      eventType: "contact_edit.request",
      outcome: "submitted",
      actorEmail: session.email,
      metadata: {
        listingId,
        requestedContactsCount: contacts.length,
        requestedCapacity: capacityValue ?? null,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not submit contact update" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { canSubmitReviews, getAuthSessionFromRequest, getRoleFromRequestAsync } from "@/lib/auth";
import { dbQuery, isDatabaseEnabled } from "@/lib/db";
import { asObject, parseDelimitedList, parseString } from "@/lib/request-validation";
import { validateSameOriginRequest } from "@/lib/request-origin";
import { recordSecurityAuditEvent } from "@/lib/security-audit";

const MAX_CONTACTS = 20;
const MAX_CONTACT_LENGTH = 180;

function parseContacts(value: unknown) {
  const parsedContacts = parseDelimitedList(value, { maxItems: MAX_CONTACTS });
  const hasContactTooLong = parsedContacts.some((item) => item.length > MAX_CONTACT_LENGTH);
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
    const listingId = parseString(payload?.listingId, { maxLength: 200 });
    const rawContacts = parseString(payload?.contacts, { maxLength: 2000 });

    if (!listingId) {
      return NextResponse.json({ error: "Missing listing" }, { status: 400 });
    }

    const { contacts, hasContactTooLong } = parseContacts(rawContacts);
    if (contacts.length === 0) {
      return NextResponse.json({ error: "Contact info is required" }, { status: 400 });
    }
    if (hasContactTooLong) {
      return NextResponse.json(
        { error: `Each contact must be at most ${MAX_CONTACT_LENGTH} characters` },
        { status: 400 },
      );
    }

    const listingResult = await dbQuery<{ address: string; neighborhood: string }>(
      `SELECT address, neighborhood FROM listings WHERE id = $1`,
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

    await dbQuery(
      `
        INSERT INTO listing_contact_edit_requests (
          listing_id,
          requester_email,
          requested_contacts,
          current_contacts,
          status
        )
        VALUES ($1, $2, $3::text[], $4::text[], 'pending')
      `,
      [listingId, session.email, contacts, currentContacts],
    );

    await recordSecurityAuditEvent({
      eventType: "contact_edit.request",
      outcome: "submitted",
      actorEmail: session.email,
      metadata: {
        listingId,
        requestedContactsCount: contacts.length,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not submit contact update" }, { status: 500 });
  }
}

import { describe, expect, it } from "vitest";

import {
  LISTING_CONTACTS_MAX_ITEMS,
  hasListingContactTooLong,
  isValidListingCapacity,
  normalizeListingContacts,
  normalizeReviewerContactFields,
  parseListingContactsFromDelimited,
  parseListingContactsFromUnknown,
  toOptionalNumber,
} from "@/lib/domain-constraints";

describe("domain-constraints", () => {
  it("parses optional numbers from mixed values", () => {
    expect(toOptionalNumber(undefined)).toBeUndefined();
    expect(toOptionalNumber(null)).toBeUndefined();
    expect(toOptionalNumber("")).toBeUndefined();
    expect(toOptionalNumber("123.5")).toBe(123.5);
    expect(toOptionalNumber("abc")).toBeUndefined();
  });

  it("parses delimited listing contacts with dedupe and max items", () => {
    const input = Array.from({ length: LISTING_CONTACTS_MAX_ITEMS + 5 }, (_, index) => `c-${index}`);
    input.push("c-1");
    const contacts = parseListingContactsFromDelimited(input.join(","));

    expect(contacts).toHaveLength(LISTING_CONTACTS_MAX_ITEMS);
    expect(contacts[0]).toBe("c-0");
    expect(contacts[1]).toBe("c-1");
  });

  it("parses listing contacts from unknown values", () => {
    expect(parseListingContactsFromUnknown("a, b\nc")).toEqual(["a", "b", "c"]);
    expect(parseListingContactsFromUnknown([" a ", "b"])).toEqual(["a", "b"]);
    expect(parseListingContactsFromUnknown(["", "b"])).toBeNull();
    expect(parseListingContactsFromUnknown(["a", 2])).toBeNull();
    expect(parseListingContactsFromUnknown({})).toBeNull();
  });

  it("normalizes listing contacts for persistence", () => {
    expect(normalizeListingContacts(["  +54 11 1111  ", "", "+54 11 1111", "mail@example.com"]))
      .toEqual(["+54 11 1111", "mail@example.com"]);
    expect(normalizeListingContacts(["a", "a", "b"], { dedupe: false, maxItems: 10 }))
      .toEqual(["a", "a", "b"]);
  });

  it("validates contact max-length and capacity limits", () => {
    expect(hasListingContactTooLong(["ok", "x".repeat(180)])).toBe(false);
    expect(hasListingContactTooLong(["x".repeat(181)])).toBe(true);

    expect(isValidListingCapacity(undefined)).toBe(true);
    expect(isValidListingCapacity(1)).toBe(true);
    expect(isValidListingCapacity(50)).toBe(true);
    expect(isValidListingCapacity(0)).toBe(false);
    expect(isValidListingCapacity(51)).toBe(false);
    expect(isValidListingCapacity(Number.NaN)).toBe(false);
  });

  it("normalizes reviewer email-like fields with strict validation", () => {
    expect(
      normalizeReviewerContactFields(" Student@Example.COM ", "+54 11 4444 5555"),
    ).toEqual({
      ok: true,
      studentEmail: "student@example.com",
      studentContact: "+54 11 4444 5555",
    });

    expect(normalizeReviewerContactFields("", " Contact@Mail.Com ")).toEqual({
      ok: true,
      studentEmail: "",
      studentContact: "contact@mail.com",
    });

    expect(normalizeReviewerContactFields("invalid-email", "")).toEqual({ ok: false });
    expect(normalizeReviewerContactFields("", "bad@domain")).toEqual({ ok: false });
  });
});

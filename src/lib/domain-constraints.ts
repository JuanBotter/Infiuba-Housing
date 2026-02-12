import { isStrictEmail, normalizeEmailInput } from "@/lib/email";
import { parseDelimitedList, parseOptionalNumber } from "@/lib/request-validation";

export const LISTING_ID_MAX_LENGTH = 200;
export const LISTING_ADDRESS_MAX_LENGTH = 180;
export const LISTING_NEIGHBORHOOD_MAX_LENGTH = 80;
export const LISTING_CONTACTS_MAX_ITEMS = 20;
export const LISTING_CONTACT_MAX_LENGTH = 180;
export const LISTING_CAPACITY_MAX = 50;
const SAFE_LISTING_TEXT_PATTERN = /^[\p{L}\p{M}\p{N}.,'"’"()\-_/#+&:;°ºª· ]+$/u;

interface NormalizeContactsOptions {
  dedupe?: boolean;
  maxItems?: number;
}

function trimNonEmptyStringArray(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter(Boolean);
}

export function toOptionalNumber(value: unknown) {
  return parseOptionalNumber(value);
}

export function parseListingContactsFromDelimited(value: unknown) {
  return parseDelimitedList(value, { maxItems: LISTING_CONTACTS_MAX_ITEMS });
}

export function parseListingContactsFromUnknown(value: unknown) {
  if (Array.isArray(value)) {
    if (!value.every((entry) => typeof entry === "string")) {
      return null;
    }
    const normalized = trimNonEmptyStringArray(value);
    return normalized.length === value.length ? normalized : null;
  }

  if (typeof value === "string") {
    return trimNonEmptyStringArray(value.split(/[\n,;]/g));
  }

  return null;
}

export function normalizeListingContacts(
  values: string[],
  options: NormalizeContactsOptions = {},
) {
  const maxItems = options.maxItems ?? LISTING_CONTACTS_MAX_ITEMS;
  const dedupe = options.dedupe ?? true;
  const trimmed = trimNonEmptyStringArray(values);
  const normalized = dedupe ? [...new Set(trimmed)] : trimmed;
  return normalized.slice(0, maxItems);
}

export function hasListingContactTooLong(values: string[]) {
  return values.some((value) => value.length > LISTING_CONTACT_MAX_LENGTH);
}

function isSafeListingText(value: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    return false;
  }
  return SAFE_LISTING_TEXT_PATTERN.test(normalized);
}

export function isSafeListingAddress(value: string) {
  return isSafeListingText(value, LISTING_ADDRESS_MAX_LENGTH);
}

export function isSafeListingNeighborhood(value: string) {
  return isSafeListingText(value, LISTING_NEIGHBORHOOD_MAX_LENGTH);
}

export function isValidListingCapacity(value: number | undefined) {
  if (value === undefined) {
    return true;
  }
  return Number.isFinite(value) && value > 0 && value <= LISTING_CAPACITY_MAX;
}

export function normalizeReviewerContactFields(studentEmail: string, studentContact: string) {
  let normalizedStudentEmail = studentEmail;
  let normalizedStudentContact = studentContact;

  if (normalizedStudentEmail) {
    if (!isStrictEmail(normalizedStudentEmail)) {
      return { ok: false as const };
    }
    normalizedStudentEmail = normalizeEmailInput(normalizedStudentEmail);
  }

  if (normalizedStudentContact.includes("@")) {
    if (!isStrictEmail(normalizedStudentContact)) {
      return { ok: false as const };
    }
    normalizedStudentContact = normalizeEmailInput(normalizedStudentContact);
  }

  return {
    ok: true as const,
    studentEmail: normalizedStudentEmail,
    studentContact: normalizedStudentContact,
  };
}

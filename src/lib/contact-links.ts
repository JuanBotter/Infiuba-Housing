import { buildSafeMailtoHref, isStrictEmail } from "@/lib/email";

export type ContactPart =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string; kind: "email" | "phone" | "url" };

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
const PHONE_REGEX = /\+?\d[\d\s().-]{6,}\d/g;

const TRAILING_PUNCTUATION = /[),.;:!?]+$/;

function findNext(regex: RegExp, text: string, start: number) {
  regex.lastIndex = start;
  const match = regex.exec(text);
  if (!match) {
    return null;
  }
  return { index: match.index, value: match[0] };
}

function stripTrailingPunctuation(value: string) {
  return value.replace(TRAILING_PUNCTUATION, "");
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  const withScheme = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
  if (!/^https?:\/\//i.test(withScheme)) {
    return null;
  }
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 7) {
    return null;
  }
  return hasPlus ? `+${digits}` : digits;
}

export function splitContactParts(text: string) {
  const parts: ContactPart[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const email = findNext(EMAIL_REGEX, text, cursor);
    const url = findNext(URL_REGEX, text, cursor);
    const phone = findNext(PHONE_REGEX, text, cursor);

    const candidates = [email && { ...email, kind: "email" as const }, url && { ...url, kind: "url" as const }, phone && { ...phone, kind: "phone" as const }]
      .filter(Boolean) as Array<{ index: number; value: string; kind: "email" | "phone" | "url" }>;

    if (candidates.length === 0) {
      parts.push({ type: "text", text: text.slice(cursor) });
      break;
    }

    const next = candidates.reduce((earliest, current) =>
      current.index < earliest.index ? current : earliest,
    );

    if (next.index > cursor) {
      parts.push({ type: "text", text: text.slice(cursor, next.index) });
    }

    const raw = next.value;
    const trimmed = stripTrailingPunctuation(raw);
    const suffix = raw.slice(trimmed.length);

    let href: string | null = null;
    if (next.kind === "email") {
      href = isStrictEmail(trimmed) ? buildSafeMailtoHref(trimmed) : null;
    } else if (next.kind === "url") {
      href = normalizeUrl(trimmed);
    } else if (next.kind === "phone") {
      const normalized = normalizePhone(trimmed);
      href = normalized ? `tel:${normalized}` : null;
    }

    if (href) {
      parts.push({ type: "link", text: trimmed, href, kind: next.kind });
    } else {
      parts.push({ type: "text", text: trimmed });
    }

    if (suffix) {
      parts.push({ type: "text", text: suffix });
    }

    cursor = next.index + raw.length;
  }

  return parts;
}

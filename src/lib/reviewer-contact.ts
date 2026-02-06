import { splitContactParts } from "@/lib/contact-links";

export type ReviewerContactPart =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string; kind: "email" | "whatsapp" | "url" };

function normalizePhoneNumber(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 ? digits : null;
}

export function splitReviewerContactParts(value: string): ReviewerContactPart[] {
  return splitContactParts(value).map((part) => {
    if (part.type !== "link") {
      return part;
    }

    if (part.kind === "phone") {
      const normalizedPhone = normalizePhoneNumber(part.text);
      if (!normalizedPhone) {
        return { type: "text", text: part.text };
      }
      return {
        type: "link",
        text: part.text,
        href: `https://wa.me/${normalizedPhone}`,
        kind: "whatsapp",
      };
    }

    if (part.kind === "url") {
      return { type: "link", text: part.text, href: part.href, kind: "url" };
    }

    return { type: "link", text: part.text, href: part.href, kind: "email" };
  });
}

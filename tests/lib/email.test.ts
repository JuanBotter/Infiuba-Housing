import { describe, expect, it } from "vitest";

import { buildSafeMailtoHref, isStrictEmail, normalizeEmailInput } from "@/lib/email";

describe("email helpers", () => {
  it("normalizes email input", () => {
    expect(normalizeEmailInput("  USER@Example.com ")).toBe("user@example.com");
  });

  it("validates strict email format", () => {
    expect(isStrictEmail("user@example.com")).toBe(true);
    expect(isStrictEmail("user.name+tag@example.co.uk")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isStrictEmail("")).toBe(false);
    expect(isStrictEmail("no-at-symbol")).toBe(false);
    expect(isStrictEmail("double@@example.com")).toBe(false);
    expect(isStrictEmail(".starts.with.dot@example.com")).toBe(false);
    expect(isStrictEmail("ends.with.dot.@example.com")).toBe(false);
    expect(isStrictEmail("two..dots@example.com")).toBe(false);
    expect(isStrictEmail("user@-example.com")).toBe(false);
    expect(isStrictEmail("user@example-.com")).toBe(false);
    expect(isStrictEmail("user@example")).toBe(false);
  });

  it("builds safe mailto links", () => {
    expect(buildSafeMailtoHref("USER@Example.com")).toBe("mailto:user%40example.com");
  });
});

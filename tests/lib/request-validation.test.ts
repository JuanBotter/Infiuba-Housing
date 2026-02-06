import { describe, expect, it } from "vitest";

import {
  asObject,
  isLikelyEmail,
  parseBoolean,
  parseBoundedInteger,
  parseDelimitedList,
  parseEnum,
  parseOptionalNumber,
  parseString,
} from "@/lib/request-validation";

describe("request validation helpers", () => {
  it("parses objects safely", () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
    expect(asObject(null)).toBeNull();
    expect(asObject([1, 2])).toBeNull();
  });

  it("parses strings with options", () => {
    expect(parseString("  Hello ")).toBe("Hello");
    expect(parseString("  Hello ", { lowercase: true })).toBe("hello");
    expect(parseString("  1 2 3 ", { stripInnerWhitespace: true })).toBe("123");
    expect(parseString("abcdef", { maxLength: 3 })).toBe("abc");
  });

  it("parses optional numbers", () => {
    expect(parseOptionalNumber("")).toBeUndefined();
    expect(parseOptionalNumber("5")).toBe(5);
    expect(parseOptionalNumber("bad")).toBeUndefined();
  });

  it("parses booleans", () => {
    expect(parseBoolean(true)).toBe(true);
    expect(parseBoolean(false)).toBe(false);
    expect(parseBoolean("true")).toBe(false);
  });

  it("parses enums", () => {
    expect(parseEnum("a", ["a", "b"] as const)).toBe("a");
    expect(parseEnum("c", ["a", "b"] as const)).toBeUndefined();
  });

  it("parses delimited lists", () => {
    expect(parseDelimitedList("a, b, a; c\nD", { lowercase: true })).toEqual(["a", "b", "c", "d"]);
    expect(parseDelimitedList("a,b,c", { maxItems: 2 })).toEqual(["a", "b"]);
  });

  it("parses bounded integers", () => {
    expect(parseBoundedInteger("5", { fallback: 1, min: 1, max: 10 })).toBe(5);
    expect(parseBoundedInteger("100", { fallback: 1, min: 1, max: 10 })).toBe(10);
    expect(parseBoundedInteger("bad", { fallback: 2, min: 1, max: 10 })).toBe(2);
  });

  it("checks likely emails", () => {
    expect(isLikelyEmail("user@example.com")).toBe(true);
    expect(isLikelyEmail("bad-email")).toBe(false);
  });
});

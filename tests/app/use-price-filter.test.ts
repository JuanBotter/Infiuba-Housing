import { describe, expect, it } from "vitest";

import { clampToRange } from "@/app/[lang]/use-price-filter";

describe("clampToRange", () => {
  it("returns min when value is below range", () => {
    expect(clampToRange(2, 5, 20)).toBe(5);
  });

  it("returns max when value is above range", () => {
    expect(clampToRange(25, 5, 20)).toBe(20);
  });

  it("returns value when value is within range", () => {
    expect(clampToRange(12, 5, 20)).toBe(12);
  });
});

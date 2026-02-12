import { describe, expect, it } from "vitest";

import { cycleCarouselIndex, normalizeCarouselIndex } from "@/lib/carousel";

describe("carousel helpers", () => {
  it("normalizes missing/invalid index values to zero", () => {
    expect(normalizeCarouselIndex(undefined, 4)).toBe(0);
    expect(normalizeCarouselIndex(2, 0)).toBe(0);
    expect(normalizeCarouselIndex(2, -1)).toBe(0);
  });

  it("wraps indexes within the available image length", () => {
    expect(normalizeCarouselIndex(5, 4)).toBe(1);
    expect(normalizeCarouselIndex(-1, 4)).toBe(3);
  });

  it("cycles forward and backward with wrap-around", () => {
    expect(cycleCarouselIndex(undefined, 3, 1)).toBe(1);
    expect(cycleCarouselIndex(0, 3, -1)).toBe(2);
    expect(cycleCarouselIndex(2, 3, 1)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import { normalizeSortBy } from "@/app/[lang]/use-place-filters-state";

describe("normalizeSortBy", () => {
  it("keeps supported sort values", () => {
    expect(normalizeSortBy("rating_desc")).toBe("rating_desc");
    expect(normalizeSortBy("price_asc")).toBe("price_asc");
    expect(normalizeSortBy("reviews_desc")).toBe("reviews_desc");
    expect(normalizeSortBy("recent_desc")).toBe("recent_desc");
  });

  it("falls back to recent_desc for unsupported values", () => {
    expect(normalizeSortBy("unknown")).toBe("recent_desc");
    expect(normalizeSortBy(undefined)).toBe("recent_desc");
  });
});

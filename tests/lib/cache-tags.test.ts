import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

let cacheTags: typeof import("@/lib/cache-tags");
let mockedNextCache: typeof import("next/cache");

beforeAll(async () => {
  cacheTags = await import("@/lib/cache-tags");
  mockedNextCache = vi.mocked(await import("next/cache"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cache-tags", () => {
  it("revalidates dataset-level listing tags", () => {
    cacheTags.revalidatePublicListingsDataset();

    expect(mockedNextCache.revalidateTag).toHaveBeenNthCalledWith(1, "public-listings", "max");
    expect(mockedNextCache.revalidateTag).toHaveBeenNthCalledWith(2, "public-neighborhoods", "max");
    expect(mockedNextCache.revalidateTag).toHaveBeenNthCalledWith(3, "public-dataset-meta", "max");
  });

  it("revalidates listing tags for a specific listing", () => {
    cacheTags.revalidatePublicListing(" listing-1 ");

    expect(mockedNextCache.revalidateTag).toHaveBeenNthCalledWith(1, "public-listings", "max");
    expect(mockedNextCache.revalidateTag).toHaveBeenNthCalledWith(2, "public-listing:listing-1", "max");
  });

  it("revalidates listing and approved-review tags together", () => {
    cacheTags.revalidatePublicListingWithApprovedReviews("listing-2");

    expect(mockedNextCache.revalidateTag).toHaveBeenNthCalledWith(1, "public-listings", "max");
    expect(mockedNextCache.revalidateTag).toHaveBeenNthCalledWith(2, "public-listing:listing-2", "max");
    expect(mockedNextCache.revalidateTag).toHaveBeenNthCalledWith(
      3,
      "public-approved-reviews",
      "max",
    );
    expect(mockedNextCache.revalidateTag).toHaveBeenNthCalledWith(
      4,
      "public-approved-reviews:listing-2",
      "max",
    );
  });
});

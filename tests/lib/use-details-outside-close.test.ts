import { describe, expect, it, vi } from "vitest";

import { shouldCloseDetailsOnPointerDown } from "@/lib/use-details-outside-close";

describe("use-details-outside-close", () => {
  it("returns false when details is missing or closed", () => {
    expect(shouldCloseDetailsOnPointerDown(null, { nodeType: 1 })).toBe(false);

    const closedDetails = {
      hasAttribute: vi.fn(() => false),
      contains: vi.fn(),
    };
    expect(shouldCloseDetailsOnPointerDown(closedDetails, { nodeType: 1 })).toBe(false);
  });

  it("returns false when event target is not node-like", () => {
    const openDetails = {
      hasAttribute: vi.fn(() => true),
      contains: vi.fn(() => false),
    };
    expect(shouldCloseDetailsOnPointerDown(openDetails, "not-a-node")).toBe(false);
  });

  it("closes only when pointer target is outside open details", () => {
    const insideTarget = { nodeType: 1, id: "inside" };
    const outsideTarget = { nodeType: 1, id: "outside" };

    const openDetails = {
      hasAttribute: vi.fn(() => true),
      contains: vi.fn((target: unknown) => target === insideTarget),
    };

    expect(shouldCloseDetailsOnPointerDown(openDetails, insideTarget)).toBe(false);
    expect(shouldCloseDetailsOnPointerDown(openDetails, outsideTarget)).toBe(true);
  });
});

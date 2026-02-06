import { describe, expect, it } from "vitest";

import { validateSameOriginRequest } from "@/lib/request-origin";

describe("request origin validation", () => {
  it("accepts matching origin header", () => {
    const request = new Request("https://example.com/api", {
      headers: { origin: "https://example.com" },
    });
    expect(validateSameOriginRequest(request).ok).toBe(true);
  });

  it("accepts matching referer", () => {
    const request = new Request("https://example.com/api", {
      headers: { referer: "https://example.com/page" },
    });
    expect(validateSameOriginRequest(request).ok).toBe(true);
  });

  it("rejects missing origin", () => {
    const request = new Request("https://example.com/api");
    const result = validateSameOriginRequest(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });
});

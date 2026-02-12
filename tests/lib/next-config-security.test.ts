import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadNextConfigWithEnv(nodeEnv: string) {
  process.env = { ...ORIGINAL_ENV, NODE_ENV: nodeEnv };
  vi.resetModules();
  return (await import("../../next.config.mjs")).default;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("next.config security headers", () => {
  it("includes hardened browser headers in production", async () => {
    const config = await loadNextConfigWithEnv("production");
    const headers = await config.headers?.();
    const hstsHeader = headers?.[0]?.headers.find(
      (header) => header.key === "Strict-Transport-Security",
    );
    const cspHeader = headers?.[0]?.headers.find((header) => header.key === "Content-Security-Policy");

    expect(hstsHeader).toBeDefined();
    expect(hstsHeader?.value).toContain("max-age=63072000");
    expect(cspHeader).toBeUndefined();
  });

  it("disables security headers in non-production", async () => {
    const config = await loadNextConfigWithEnv("test");
    await expect(config.headers?.()).resolves.toEqual([]);
  });
});

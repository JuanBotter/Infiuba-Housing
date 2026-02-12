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
  it("includes Vercel Blob CDN in production CSP img-src", async () => {
    const config = await loadNextConfigWithEnv("production");
    const headers = await config.headers?.();
    const cspHeader = headers?.[0]?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    );

    expect(cspHeader).toBeDefined();
    expect(cspHeader?.value).toContain("img-src");
    expect(cspHeader?.value).toContain("https://*.public.blob.vercel-storage.com");
  });

  it("disables security headers in non-production", async () => {
    const config = await loadNextConfigWithEnv("test");
    await expect(config.headers?.()).resolves.toEqual([]);
  });
});

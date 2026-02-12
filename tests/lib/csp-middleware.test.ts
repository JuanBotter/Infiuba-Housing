import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadMiddlewareWithEnv(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...env };
  vi.resetModules();
  return await import("../../middleware");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("csp middleware", () => {
  it("sets nonce-based CSP for production html document requests", async () => {
    const { middleware } = await loadMiddlewareWithEnv({ NODE_ENV: "production" });

    const response = middleware(
      new Request("https://example.com/es", {
        headers: { accept: "text/html" },
      }) as never,
    );

    const csp = response.headers.get("Content-Security-Policy") || "";
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("style-src 'self' 'nonce-");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("style-src-attr 'none'");
    expect(csp).toContain("report-uri /api/security/csp-report");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("style-src-attr 'unsafe-inline'");
    expect(csp).toContain("https://*.public.blob.vercel-storage.com");

    const nonce = response.headers.get("x-nonce");
    expect(typeof nonce).toBe("string");
    expect(nonce && nonce.length > 10).toBe(true);
  });

  it("does not set CSP outside production", async () => {
    const { middleware } = await loadMiddlewareWithEnv({ NODE_ENV: "test" });

    const response = middleware(
      new Request("https://example.com/es", {
        headers: { accept: "text/html" },
      }) as never,
    );

    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("x-nonce")).toBeNull();
  });

  it("skips CSP for non-html requests", async () => {
    const { middleware } = await loadMiddlewareWithEnv({ NODE_ENV: "production" });

    const response = middleware(
      new Request("https://example.com/api/session", {
        headers: { accept: "application/json" },
      }) as never,
    );

    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadRequestNetworkWithEnv(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...env };
  vi.resetModules();
  return await import("@/lib/request-network");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("request network fingerprint", () => {
  it("uses trusted x-forwarded-for chain and defaults to the right-most hop", async () => {
    const requestNetwork = await loadRequestNetworkWithEnv({
      TRUSTED_IP_HEADER: "x-forwarded-for",
      TRUSTED_PROXY_HOPS: "1",
    });
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "198.51.100.5, 203.0.113.9" },
    });

    const fingerprint = requestNetwork.getRequestNetworkFingerprint(request);
    expect(fingerprint.ipKey).toBe("ipv4:203.0.113.9");
    expect(fingerprint.subnetKey).toBe("ipv4-subnet:203.0.113.0/24");
  });

  it("supports configurable trusted proxy hops for x-forwarded-for", async () => {
    const requestNetwork = await loadRequestNetworkWithEnv({
      TRUSTED_IP_HEADER: "x-forwarded-for",
      TRUSTED_PROXY_HOPS: "2",
    });
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "198.51.100.5, 203.0.113.9" },
    });

    const fingerprint = requestNetwork.getRequestNetworkFingerprint(request);
    expect(fingerprint.ipKey).toBe("ipv4:198.51.100.5");
    expect(fingerprint.subnetKey).toBe("ipv4-subnet:198.51.100.0/24");
  });

  it("uses the explicitly trusted canonical header", async () => {
    const requestNetwork = await loadRequestNetworkWithEnv({
      TRUSTED_IP_HEADER: "cf-connecting-ip",
      TRUSTED_PROXY_HOPS: "1",
    });
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "198.51.100.5, 203.0.113.9",
        "cf-connecting-ip": "203.0.113.11",
      },
    });

    const fingerprint = requestNetwork.getRequestNetworkFingerprint(request);
    expect(fingerprint.ipKey).toBe("ipv4:203.0.113.11");
    expect(fingerprint.subnetKey).toBe("ipv4-subnet:203.0.113.0/24");
  });

  it("warns in production when trusted header configuration is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const requestNetwork = await loadRequestNetworkWithEnv({
      NODE_ENV: "production",
      TRUSTED_IP_HEADER: undefined,
    });

    requestNetwork.getRequestNetworkFingerprint(
      new Request("https://example.com", {
        headers: { "x-forwarded-for": "198.51.100.5" },
      }),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("TRUSTED_IP_HEADER is not set in production"),
    );
  });

  it("falls back to unknown when no trusted header value is present", async () => {
    const requestNetwork = await loadRequestNetworkWithEnv({
      TRUSTED_IP_HEADER: "x-real-ip",
    });
    const request = new Request("https://example.com");

    const fingerprint = requestNetwork.getRequestNetworkFingerprint(request);
    expect(fingerprint.ipKey).toBe("unknown");
    expect(fingerprint.subnetKey).toBe("unknown");
  });
});

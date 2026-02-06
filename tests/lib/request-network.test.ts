import { describe, expect, it } from "vitest";

import { getRequestNetworkFingerprint } from "@/lib/request-network";

describe("request network fingerprint", () => {
  it("uses x-forwarded-for IPv4", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    const fingerprint = getRequestNetworkFingerprint(request);
    expect(fingerprint.ipKey).toBe("ipv4:203.0.113.5");
    expect(fingerprint.subnetKey).toBe("ipv4-subnet:203.0.113.0/24");
  });

  it("uses forwarded IPv6", () => {
    const request = new Request("https://example.com", {
      headers: { forwarded: "for=2001:db8:85a3::8a2e:370:7334" },
    });
    const fingerprint = getRequestNetworkFingerprint(request);
    expect(fingerprint.ipKey).toBe("ipv6:2001:db8:85a3::8a2e:370:7334");
    expect(fingerprint.subnetKey.startsWith("ipv6-subnet:")).toBe(true);
  });

  it("falls back to unknown when no ip headers", () => {
    const request = new Request("https://example.com");
    const fingerprint = getRequestNetworkFingerprint(request);
    expect(fingerprint.ipKey).toBe("unknown");
    expect(fingerprint.subnetKey).toBe("unknown");
  });
});

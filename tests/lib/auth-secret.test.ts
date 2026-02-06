import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadAuthWithEnv(nextEnv: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...nextEnv };
  vi.resetModules();
  return import("@/lib/auth");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("auth secret handling", () => {
  it("throws in production when AUTH_SECRET is missing", async () => {
    const auth = await loadAuthWithEnv({ NODE_ENV: "production", AUTH_SECRET: "" });
    expect(() => auth.createRoleSession("admin")).toThrow(/AUTH_SECRET/i);
  });

  it("throws in production when AUTH_SECRET is weak", async () => {
    const auth = await loadAuthWithEnv({ NODE_ENV: "production", AUTH_SECRET: "changeme" });
    expect(() => auth.createRoleSession("admin")).toThrow(/AUTH_SECRET/i);
  });

  it("warns once for weak secrets in non-production", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const auth = await loadAuthWithEnv({ NODE_ENV: "test", AUTH_SECRET: "changeme" });

    auth.createRoleSession("admin");
    auth.createRoleSession("admin");

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns once when AUTH_SECRET is missing in non-production", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const auth = await loadAuthWithEnv({ NODE_ENV: "test", AUTH_SECRET: "" });

    auth.createRoleSession("admin");
    auth.createRoleSession("admin");

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

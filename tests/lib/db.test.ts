import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

type MockPoolType = {
  lastConfig?: { connectionString?: string; ssl?: unknown };
};

async function loadDbWithEnv(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...env };
  delete (global as typeof globalThis & { __infiubaPool?: unknown }).__infiubaPool;
  vi.resetModules();

  const poolQuery = vi.fn();
  const poolConnect = vi.fn();
  class MockPool {
    static lastConfig: MockPoolType["lastConfig"];
    constructor(config: { connectionString?: string; ssl?: unknown }) {
      MockPool.lastConfig = config;
    }
    query = poolQuery;
    connect = poolConnect;
  }

  vi.doMock("pg", () => ({ Pool: MockPool }));
  const db = await import("@/lib/db");
  return { db, poolQuery, poolConnect, MockPool };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("db helpers", () => {
  it("throws when DATABASE_URL is missing", async () => {
    const { db } = await loadDbWithEnv({ DATABASE_URL: "" });
    expect(() => db.getPool()).toThrow(/DATABASE_URL/);
  });

  it("builds pool without ssl when PGSSL is disabled", async () => {
    const { db, MockPool } = await loadDbWithEnv({
      DATABASE_URL: "postgres://test",
      PGSSL: "",
    });
    db.getPool();
    expect(MockPool.lastConfig?.ssl).toBeUndefined();
  });

  it("allows insecure ssl in non-production with warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, MockPool } = await loadDbWithEnv({
      DATABASE_URL: "postgres://test",
      PGSSL: "true",
      PGSSL_ALLOW_INSECURE: "true",
      NODE_ENV: "test",
    });
    db.getPool();
    expect(MockPool.lastConfig?.ssl).toEqual({ rejectUnauthorized: false });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("rejects insecure ssl in production", async () => {
    const { db } = await loadDbWithEnv({
      DATABASE_URL: "postgres://test",
      PGSSL: "true",
      PGSSL_ALLOW_INSECURE: "true",
      NODE_ENV: "production",
    });
    expect(() => db.getPool()).toThrow(/PGSSL_ALLOW_INSECURE/);
  });

  it("normalizes CA cert when provided", async () => {
    const { db, MockPool } = await loadDbWithEnv({
      DATABASE_URL: "postgres://test",
      PGSSL: "true",
      PGSSL_CA_CERT: "line1\\nline2",
    });
    db.getPool();
    expect(MockPool.lastConfig?.ssl).toEqual({ rejectUnauthorized: true, ca: "line1\nline2" });
  });

  it("reuses the global pool", async () => {
    const { db } = await loadDbWithEnv({
      DATABASE_URL: "postgres://test",
    });
    const first = db.getPool();
    const second = db.getPool();
    expect(first).toBe(second);
  });

  it("runs dbQuery through pool", async () => {
    const { db, poolQuery } = await loadDbWithEnv({
      DATABASE_URL: "postgres://test",
    });
    poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await db.dbQuery("SELECT 1");
    expect(poolQuery).toHaveBeenCalledWith("SELECT 1", []);
  });

  it("commits transactions on success", async () => {
    const { db, poolConnect } = await loadDbWithEnv({
      DATABASE_URL: "postgres://test",
    });
    const clientQuery = vi.fn();
    const release = vi.fn();
    poolConnect.mockResolvedValueOnce({ query: clientQuery, release });

    const result = await db.withTransaction(async () => "ok");
    expect(result).toBe("ok");
    expect(clientQuery).toHaveBeenCalledWith("BEGIN");
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalled();
  });

  it("rolls back transactions on failure", async () => {
    const { db, poolConnect } = await loadDbWithEnv({
      DATABASE_URL: "postgres://test",
    });
    const clientQuery = vi.fn();
    const release = vi.fn();
    poolConnect.mockResolvedValueOnce({ query: clientQuery, release });

    await expect(
      db.withTransaction(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(clientQuery).toHaveBeenCalledWith("BEGIN");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });
});

import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  isDatabaseEnabled: vi.fn(() => true),
  dbQuery: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("@/lib/otp-mailer", () => ({
  sendLoginOtp: vi.fn(),
}));

let requestLoginOtp: typeof import("@/lib/auth").requestLoginOtp;
let verifyLoginOtp: typeof import("@/lib/auth").verifyLoginOtp;
let mockedDb: typeof import("@/lib/db");
let mockedMailer: typeof import("@/lib/otp-mailer");

beforeAll(async () => {
  const auth = await import("@/lib/auth");
  requestLoginOtp = auth.requestLoginOtp;
  verifyLoginOtp = auth.verifyLoginOtp;
  mockedDb = vi.mocked(await import("@/lib/db"));
  mockedMailer = vi.mocked(await import("@/lib/otp-mailer"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedDb.isDatabaseEnabled.mockReturnValue(true);
});

function defaultRateLimitResult() {
  return { rowCount: 1, rows: [{ hits: 0 }] };
}

describe("auth OTP flow", () => {
  it("rejects invalid email addresses", async () => {
    const result = await requestLoginOtp("not-an-email");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_email");
    }
  });

  it("rejects OTP request when database is unavailable", async () => {
    mockedDb.isDatabaseEnabled.mockReturnValueOnce(false);
    const result = await requestLoginOtp("student@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("db_unavailable");
    }
  });

  it("rate limits OTP requests", async () => {
    mockedDb.dbQuery.mockImplementation(async (text: string) => {
      if (text.includes("auth_rate_limit_buckets")) {
        return { rowCount: 1, rows: [{ hits: 9999 }] } as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });

    const result = await requestLoginOtp("student@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rate_limited");
      expect(result.retryAfterSeconds).toBeDefined();
    }
  });

  it("rejects OTP request when user is not allowed", async () => {
    mockedDb.dbQuery.mockImplementation(async (text: string) => {
      if (text.includes("auth_rate_limit_buckets")) {
        return defaultRateLimitResult() as never;
      }
      if (text.includes("FROM users")) {
        return { rowCount: 0, rows: [] } as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });

    const result = await requestLoginOtp("student@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_allowed");
    }
  });

  it("returns delivery_unavailable when provider is missing", async () => {
    mockedDb.dbQuery.mockImplementation(async (text: string) => {
      if (text.includes("auth_rate_limit_buckets")) {
        return defaultRateLimitResult() as never;
      }
      if (text.includes("FROM users")) {
        return {
          rowCount: 1,
          rows: [{ role: "whitelisted", is_active: true }],
        } as never;
      }
      if (text.includes("FROM auth_email_otps")) {
        return { rowCount: 0, rows: [] } as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });

    mockedDb.withTransaction.mockImplementationOnce(async (callback) => {
      const client = {
        query: vi.fn(async (text: string) => {
          if (text.includes("INSERT INTO auth_email_otps")) {
            return { rows: [{ id: 1, expires_at: new Date().toISOString() }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      };
      return callback(client as never);
    });

    mockedMailer.sendLoginOtp.mockResolvedValueOnce({ ok: false, reason: "provider_unavailable" });

    const result = await requestLoginOtp("student@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("delivery_unavailable");
    }
  });

  it("returns delivery_failed when provider send fails", async () => {
    mockedDb.dbQuery.mockImplementation(async (text: string) => {
      if (text.includes("auth_rate_limit_buckets")) {
        return defaultRateLimitResult() as never;
      }
      if (text.includes("FROM users")) {
        return {
          rowCount: 1,
          rows: [{ role: "whitelisted", is_active: true }],
        } as never;
      }
      if (text.includes("FROM auth_email_otps")) {
        return { rowCount: 0, rows: [] } as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });

    mockedDb.withTransaction.mockImplementationOnce(async (callback) => {
      const client = {
        query: vi.fn(async (text: string) => {
          if (text.includes("INSERT INTO auth_email_otps")) {
            return { rows: [{ id: 1, expires_at: new Date().toISOString() }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      };
      return callback(client as never);
    });

    mockedMailer.sendLoginOtp.mockResolvedValueOnce({ ok: false, reason: "send_failed" });

    const result = await requestLoginOtp("student@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("delivery_failed");
    }
  });

  it("creates OTP request when user is allowed", async () => {
    mockedDb.dbQuery.mockImplementation(async (text: string) => {
      if (text.includes("auth_rate_limit_buckets")) {
        return defaultRateLimitResult() as never;
      }
      if (text.includes("FROM users")) {
        return {
          rowCount: 1,
          rows: [{ role: "whitelisted", is_active: true }],
        } as never;
      }
      if (text.includes("FROM auth_email_otps")) {
        return { rowCount: 0, rows: [] } as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });

    mockedDb.withTransaction.mockImplementationOnce(async (callback) => {
      const client = {
        query: vi.fn(async (text: string) => {
          if (text.includes("INSERT INTO auth_email_otps")) {
            return { rows: [{ id: 1, expires_at: new Date().toISOString() }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      };
      return callback(client as never);
    });

    mockedMailer.sendLoginOtp.mockResolvedValueOnce({ ok: true });

    const result = await requestLoginOtp("student@example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe("student@example.com");
    }
  });

  it("rejects OTP verification with invalid email", async () => {
    const result = await verifyLoginOtp("not-an-email", "123456");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_email");
    }
  });

  it("rejects OTP verification when rate limited", async () => {
    mockedDb.dbQuery.mockImplementation(async (text: string) => {
      if (text.includes("auth_rate_limit_buckets")) {
        return { rowCount: 1, rows: [{ hits: 9999 }] } as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });

    const result = await verifyLoginOtp("admin@example.com", "123456");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_or_expired");
    }
  });

  it("rejects OTP verification with malformed codes", async () => {
    mockedDb.dbQuery.mockImplementation(async (text: string) => {
      if (text.includes("auth_rate_limit_buckets")) {
        return defaultRateLimitResult() as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });

    const result = await verifyLoginOtp("admin@example.com", "abc");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_code");
    }
  });

  it("rejects OTP verification after too many attempts", async () => {
    mockedDb.dbQuery.mockImplementation(async (text: string) => {
      if (text.includes("auth_rate_limit_buckets")) {
        return defaultRateLimitResult() as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });

    mockedDb.withTransaction.mockImplementationOnce(async (callback) => {
      const client = {
        query: vi.fn(async (text: string) => {
          if (text.includes("FROM users")) {
            return { rowCount: 1, rows: [{ role: "admin", is_active: true }] };
          }
          if (text.includes("FROM auth_email_otps")) {
            return { rowCount: 1, rows: [{ id: 1, code_hash: "nope", attempts: 5 }] };
          }
          return { rowCount: 0, rows: [] };
        }),
      };
      return callback(client as never);
    });

    const result = await verifyLoginOtp("admin@example.com", "123456");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_or_expired");
    }
  });

  it("verifies OTP when code matches", async () => {
    const email = "admin@example.com";
    const code = "123456";
    const secret = process.env.AUTH_SECRET || "test-secret";
    const expectedHash = createHmac("sha256", secret)
      .update(`${email}|${code}`)
      .digest("hex");

    mockedDb.dbQuery.mockImplementation(async (text: string) => {
      if (text.includes("auth_rate_limit_buckets")) {
        return defaultRateLimitResult() as never;
      }
      return { rowCount: 0, rows: [] } as never;
    });

    mockedDb.withTransaction.mockImplementationOnce(async (callback) => {
      const client = {
        query: vi.fn(async (text: string) => {
          if (text.includes("FROM users")) {
            return { rowCount: 1, rows: [{ role: "admin", is_active: true }] };
          }
          if (text.includes("FROM auth_email_otps")) {
            return { rowCount: 1, rows: [{ id: 1, code_hash: expectedHash, attempts: 0 }] };
          }
          return { rowCount: 0, rows: [] };
        }),
      };
      return callback(client as never);
    });

    const result = await verifyLoginOtp(email, code);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("admin");
    }
  });
});

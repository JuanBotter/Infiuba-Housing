import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendLoginOtp } from "@/lib/otp-mailer";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("otp mailer", () => {
  it("uses console provider in non-production", async () => {
    process.env.OTP_EMAIL_PROVIDER = "console";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendLoginOtp({ email: "user@example.com", code: "123456", expiresMinutes: 10 });
    expect(result.ok).toBe(true);
    expect(infoSpy).toHaveBeenCalled();
  });

  it("forces console delivery for console-only email override", async () => {
    process.env.OTP_EMAIL_PROVIDER = "brevo";
    process.env.OTP_CONSOLE_ONLY_EMAIL = "force@example.com";
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendLoginOtp({ email: "force@example.com", code: "654321", expiresMinutes: 10 });
    expect(result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
  });

  it("returns provider_unavailable when brevo config is missing", async () => {
    process.env.OTP_EMAIL_PROVIDER = "brevo";
    delete process.env.BREVO_API_KEY;
    process.env.BREVO_FROM_EMAIL = "Infiuba <sender@example.com>";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendLoginOtp({ email: "user@example.com", code: "123456", expiresMinutes: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("provider_unavailable");
    }
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns send_failed when brevo send fails", async () => {
    process.env.OTP_EMAIL_PROVIDER = "brevo";
    process.env.BREVO_API_KEY = "test-key";
    process.env.BREVO_FROM_EMAIL = "Infiuba <sender@example.com>";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "fail",
    })) as unknown as typeof fetch;

    const result = await sendLoginOtp({ email: "user@example.com", code: "123456", expiresMinutes: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("send_failed");
    }
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns send_failed when resend send fails", async () => {
    process.env.OTP_EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "sender@example.com";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => "error",
    })) as unknown as typeof fetch;

    const result = await sendLoginOtp({ email: "user@example.com", code: "123456", expiresMinutes: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("send_failed");
    }
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns provider_unavailable when provider is unset in production", async () => {
    process.env.OTP_EMAIL_PROVIDER = "";
    process.env.NODE_ENV = "production";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendLoginOtp({ email: "user@example.com", code: "123456", expiresMinutes: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("provider_unavailable");
    }
    expect(warnSpy).toHaveBeenCalled();
  });
});

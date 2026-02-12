import { afterEach, vi } from "vitest";

// Ensure unit tests are deterministic regardless of the caller's shell env.
process.env.AUTH_SECRET = "test-secret-32-characters-minimum!";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test";
}
process.env.OTP_EMAIL_PROVIDER = "console";
process.env.NODE_ENV = "test";

afterEach(() => {
  vi.clearAllMocks();
});

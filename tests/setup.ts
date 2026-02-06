import { afterEach, beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-32-characters-minimum!";
  process.env.DATABASE_URL = "postgres://test";
  process.env.OTP_EMAIL_PROVIDER = "console";
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  vi.clearAllMocks();
});

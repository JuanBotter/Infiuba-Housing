import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  createRoleSession,
  getAuthSessionFromRequest,
  requestLoginOtp,
  verifyLoginOtp,
  ROLE_COOKIE_NAME,
} from "@/lib/auth";
import { dbQuery } from "@/lib/db";
import { resetIntegrationDatabase, seedUser } from "./helpers";

describe("integration: auth otp", () => {
  beforeEach(async () => {
    await resetIntegrationDatabase();
    await seedUser("admin@example.com", "admin");
  });

  it("creates an OTP request and stores it", async () => {
    const result = await requestLoginOtp("admin@example.com");
    expect(result.ok).toBe(true);

    const rows = await dbQuery<{ email: string }>(
      `SELECT email FROM auth_email_otps WHERE email = $1`,
      ["admin@example.com"],
    );
    expect(rows.rowCount).toBe(1);
  });

  it("verifies OTP when stored hash matches", async () => {
    const email = "admin@example.com";
    const code = "123456";
    const secret = process.env.AUTH_SECRET || "test-secret";
    const hash = createHmac("sha256", secret).update(`${email}|${code}`).digest("hex");

    await dbQuery(
      `
        INSERT INTO auth_email_otps (email, code_hash, expires_at, attempts, created_at)
        VALUES ($1, $2, NOW() + make_interval(mins => 15), 0, NOW())
      `,
      [email, hash],
    );

    const result = await verifyLoginOtp(email, code);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("admin");
    }
  });

  it("validates OTP session roles against the database", async () => {
    await seedUser("student@example.com", "whitelisted");
    const token = createRoleSession("whitelisted", {
      authMethod: "otp",
      email: "student@example.com",
    });

    const session = await getAuthSessionFromRequest(
      new Request("http://localhost", {
        headers: { cookie: `${ROLE_COOKIE_NAME}=${token}` },
      }),
    );

    expect(session.role).toBe("whitelisted");
  });
});

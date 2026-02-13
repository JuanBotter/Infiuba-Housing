import { createHmac } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  isDatabaseEnabled: vi.fn(() => false),
  dbQuery: vi.fn(),
  withTransaction: vi.fn(),
}));

let auth: typeof import("@/lib/auth");
let mockedDb: typeof import("@/lib/db");

const ORIGINAL_VISITOR_CONTACTS = process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS;
const ORIGINAL_VISITOR_CONTACTS_PROD_ACK = process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS_ALLOW_PRODUCTION;
const ORIGINAL_VISITOR_REVIEW_SUBMISSIONS = process.env.VISITOR_CAN_SUBMIT_REVIEWS;
const ORIGINAL_VISITOR_REVIEW_SUBMISSIONS_PROD_ACK = process.env.VISITOR_CAN_SUBMIT_REVIEWS_ALLOW_PRODUCTION;
const ORIGINAL_VISITOR_REVIEW_IMAGE_UPLOADS = process.env.VISITOR_CAN_UPLOAD_REVIEW_IMAGES;
const ORIGINAL_VISITOR_REVIEW_IMAGE_UPLOADS_PROD_ACK =
  process.env.VISITOR_CAN_UPLOAD_REVIEW_IMAGES_ALLOW_PRODUCTION;

beforeAll(async () => {
  auth = await import("@/lib/auth");
  mockedDb = vi.mocked(await import("@/lib/db"));
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS = ORIGINAL_VISITOR_CONTACTS;
  process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS_ALLOW_PRODUCTION = ORIGINAL_VISITOR_CONTACTS_PROD_ACK;
  process.env.VISITOR_CAN_SUBMIT_REVIEWS = ORIGINAL_VISITOR_REVIEW_SUBMISSIONS;
  process.env.VISITOR_CAN_SUBMIT_REVIEWS_ALLOW_PRODUCTION = ORIGINAL_VISITOR_REVIEW_SUBMISSIONS_PROD_ACK;
  process.env.VISITOR_CAN_UPLOAD_REVIEW_IMAGES = ORIGINAL_VISITOR_REVIEW_IMAGE_UPLOADS;
  process.env.VISITOR_CAN_UPLOAD_REVIEW_IMAGES_ALLOW_PRODUCTION = ORIGINAL_VISITOR_REVIEW_IMAGE_UPLOADS_PROD_ACK;
  process.env.NODE_ENV = "test";
});

describe("auth session helpers", () => {
  it("creates and resolves a v2 session token", () => {
    const token = auth.createRoleSession("admin", {
      authMethod: "otp",
      email: "admin@example.com",
    });
    const resolved = auth.resolveSessionFromToken(token);
    expect(resolved.role).toBe("admin");
    expect(resolved.authMethod).toBe("otp");
    expect(resolved.email).toBe("admin@example.com");
  });

  it("returns visitor for invalid session tokens", () => {
    const token = auth.createRoleSession("admin", { authMethod: "otp", email: "admin@example.com" });
    const tampered = `${token.slice(0, -1)}x`;
    const resolved = auth.resolveSessionFromToken(tampered);
    expect(resolved.role).toBe("visitor");
  });

  it("supports legacy v1 session tokens", () => {
    const payload = "v1:admin";
    const secret = process.env.AUTH_SECRET || "test-secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    const token = `${payload}.${signature}`;
    const resolved = auth.resolveSessionFromToken(token);
    expect(resolved.role).toBe("admin");
  });

  it("reads session from cookie header", () => {
    const token = auth.createRoleSession("whitelisted", {
      authMethod: "otp",
      email: "student@example.com",
    });
    const cookie = `other=1; ${auth.ROLE_COOKIE_NAME}=${encodeURIComponent(token)};`;
    const session = auth.getSessionFromCookieHeader(cookie);
    expect(session.role).toBe("whitelisted");
    expect(session.email).toBe("student@example.com");
  });

  it("reads role from request cookies", () => {
    const token = auth.createRoleSession("admin", {
      authMethod: "otp",
      email: "admin@example.com",
    });
    const request = new Request("http://localhost", {
      headers: { cookie: `${auth.ROLE_COOKIE_NAME}=${token}` },
    });
    expect(auth.getRoleFromRequest(request)).toBe("admin");
  });

  it("builds role cookies with trust device options", () => {
    const trusted = auth.buildRoleCookie("admin", { trustDevice: true });
    expect(trusted.maxAge).toBeDefined();

    const sessionOnly = auth.buildRoleCookie("admin", { trustDevice: false });
    expect(sessionOnly.maxAge).toBeUndefined();

    const defaultCookie = auth.buildRoleCookie("admin");
    expect(defaultCookie.maxAge).toBeDefined();
  });

  it("clears role cookies", () => {
    const cleared = auth.buildRoleCookieClear();
    expect(cleared.maxAge).toBe(0);
    expect(cleared.value).toBe("");
  });

  it("builds and clears magic-link state cookies", () => {
    const cookie = auth.buildMagicLinkStateCookie("magic-state-12345678901234567890");
    expect(cookie.name).toBe(auth.MAGIC_LINK_STATE_COOKIE_NAME);
    expect(cookie.maxAge).toBeGreaterThan(0);

    const cleared = auth.buildMagicLinkStateCookieClear();
    expect(cleared.name).toBe(auth.MAGIC_LINK_STATE_COOKIE_NAME);
    expect(cleared.maxAge).toBe(0);
  });

  it("reads magic-link state from cookie headers", () => {
    const value = auth.getMagicLinkStateFromCookieHeader(
      `${auth.MAGIC_LINK_STATE_COOKIE_NAME}=magic-state-12345678901234567890`,
    );
    expect(value).toBe("magic-state-12345678901234567890");
  });

  it("honors visitor contact override flag", () => {
    process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS = "true";
    expect(auth.canViewOwnerContactInfo("visitor")).toBe(true);

    process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS = "false";
    expect(auth.canViewOwnerContactInfo("visitor")).toBe(false);
  });

  it("blocks visitor contact override in production without explicit acknowledgement", () => {
    process.env.NODE_ENV = "production";
    process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS = "true";
    process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS_ALLOW_PRODUCTION = "false";

    expect(() => auth.canViewOwnerContactInfo("visitor")).toThrow(
      /VISITOR_CAN_VIEW_OWNER_CONTACTS=true requires/,
    );
  });

  it("honors visitor review submission override flag", () => {
    process.env.VISITOR_CAN_SUBMIT_REVIEWS = "true";
    expect(auth.canSubmitReviews("visitor")).toBe(true);

    process.env.VISITOR_CAN_SUBMIT_REVIEWS = "false";
    expect(auth.canSubmitReviews("visitor")).toBe(false);
  });

  it("blocks visitor review submission override in production without explicit acknowledgement", () => {
    process.env.NODE_ENV = "production";
    process.env.VISITOR_CAN_SUBMIT_REVIEWS = "true";
    process.env.VISITOR_CAN_SUBMIT_REVIEWS_ALLOW_PRODUCTION = "false";

    expect(() => auth.canSubmitReviews("visitor")).toThrow(
      /VISITOR_CAN_SUBMIT_REVIEWS=true requires/,
    );
  });

  it("honors visitor review image upload override flag", () => {
    process.env.VISITOR_CAN_SUBMIT_REVIEWS = "true";
    process.env.VISITOR_CAN_UPLOAD_REVIEW_IMAGES = "true";
    expect(auth.canUploadReviewImages("visitor")).toBe(true);

    process.env.VISITOR_CAN_UPLOAD_REVIEW_IMAGES = "false";
    expect(auth.canUploadReviewImages("visitor")).toBe(false);
  });

  it("blocks visitor review image upload override in production without explicit acknowledgement", () => {
    process.env.NODE_ENV = "production";
    process.env.VISITOR_CAN_SUBMIT_REVIEWS = "true";
    process.env.VISITOR_CAN_SUBMIT_REVIEWS_ALLOW_PRODUCTION = "true";
    process.env.VISITOR_CAN_UPLOAD_REVIEW_IMAGES = "true";
    process.env.VISITOR_CAN_UPLOAD_REVIEW_IMAGES_ALLOW_PRODUCTION = "false";

    expect(() => auth.canUploadReviewImages("visitor")).toThrow(
      /VISITOR_CAN_UPLOAD_REVIEW_IMAGES=true requires/,
    );
  });

  it("validates OTP sessions against the database", async () => {
    const token = auth.createRoleSession("whitelisted", {
      authMethod: "otp",
      email: "student@example.com",
    });

    mockedDb.isDatabaseEnabled.mockReturnValueOnce(false);
    const blocked = await auth.getAuthSessionFromRequest(
      new Request("http://localhost", {
        headers: { cookie: `${auth.ROLE_COOKIE_NAME}=${token}` },
      }),
    );
    expect(blocked.role).toBe("visitor");

    mockedDb.isDatabaseEnabled.mockReturnValueOnce(true);
    mockedDb.dbQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ role: "admin", is_active: true }],
    } as never);

    const allowed = await auth.getAuthSessionFromRequest(
      new Request("http://localhost", {
        headers: { cookie: `${auth.ROLE_COOKIE_NAME}=${token}` },
      }),
    );
    expect(allowed.role).toBe("admin");
  });

  it("drops sessions with invalid auth method", async () => {
    const payload = "v2|admin|magic|";
    const secret = process.env.AUTH_SECRET || "test-secret";
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    const token = `${payload}.${signature}`;

    const session = await auth.getAuthSessionFromRequest(
      new Request("http://localhost", {
        headers: { cookie: `${auth.ROLE_COOKIE_NAME}=${token}` },
      }),
    );

    expect(session.role).toBe("visitor");
  });
});

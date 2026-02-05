import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { dbQuery, isDatabaseEnabled, withTransaction } from "@/lib/db";
import { sendLoginOtp } from "@/lib/otp-mailer";
import type { AuthMethod, UserRole } from "@/types";

export const ROLE_COOKIE_NAME = "infiuba_role";

const ROLE_COOKIE_DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 120;
const ROLE_COOKIE_TRUSTED_DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const OTP_ONLY_PASSWORD_HASH = "otp-only";
const OTP_CODE_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 15;
const OTP_MIN_RESEND_INTERVAL_SECONDS = 45;
const OTP_MAX_ATTEMPTS = 5;

let runtimeSecret: string | null = null;

function isUserRole(value: string): value is UserRole {
  return value === "visitor" || value === "whitelisted" || value === "admin";
}

function isAuthMethod(value: string): value is AuthMethod {
  return value === "otp";
}

function parseBooleanEnvFlag(raw: string | undefined) {
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isMissingOtpStorageError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === "42P01") {
    return true;
  }

  const message = "message" in error ? (error as { message?: unknown }).message : undefined;
  return typeof message === "string" && message.includes("auth_email_otps");
}

interface ManagedUserRow {
  email: string;
  role: "whitelisted" | "admin";
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

interface DeletedUserRow {
  email: string;
  deleted_at: string | Date;
}

interface ActiveUserRow {
  role: string;
  is_active: boolean;
}

interface OtpRequestThrottleRow {
  created_at: string | Date;
}

interface CreatedOtpRow {
  id: number;
  expires_at: string | Date;
}

interface OtpValidationRow {
  id: number;
  code_hash: string;
  attempts: number;
}

export interface AuthSession {
  role: UserRole;
  authMethod?: AuthMethod;
  email?: string;
}

export interface ManagedUserItem {
  email: string;
  role: "whitelisted" | "admin";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeletedUserItem {
  email: string;
  deletedAt: string;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function encodeEmailForSession(email: string) {
  return Buffer.from(normalizeEmail(email), "utf8").toString("base64url");
}

function decodeEmailFromSession(encoded: string) {
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function createOtpCode() {
  const max = 10 ** OTP_CODE_LENGTH;
  return randomInt(0, max).toString().padStart(OTP_CODE_LENGTH, "0");
}

function hashOtpCode(email: string, code: string) {
  const normalizedCode = code.trim();
  return createHmac("sha256", getSigningSecret())
    .update(`${normalizeEmail(email)}|${normalizedCode}`)
    .digest("hex");
}

function normalizeOtpCode(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function isValidOtpCode(value: string) {
  return new RegExp(`^[0-9]{${OTP_CODE_LENGTH}}$`).test(value);
}

function normalizeDateToIsoString(value: string | Date) {
  return typeof value === "string" ? value : value.toISOString();
}

function getSigningSecret() {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) {
    return configured;
  }

  if (!runtimeSecret) {
    runtimeSecret = randomBytes(32).toString("hex");
  }
  return runtimeSecret;
}

function sign(payload: string) {
  return createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookieHeader(cookieHeader: string) {
  const parsed: Record<string, string> = {};

  for (const segment of cookieHeader.split(";")) {
    const [name, ...rest] = segment.trim().split("=");
    if (!name || rest.length === 0) {
      continue;
    }

    const value = rest.join("=");
    parsed[name] = value;
  }

  return parsed;
}

export function createRoleSession(
  role: Exclude<UserRole, "visitor">,
  options?: { authMethod?: AuthMethod; email?: string },
) {
  const authMethod = options?.authMethod || "otp";
  const encodedEmail = options?.email ? encodeEmailForSession(options.email) : "";
  const payload = `v2|${role}|${authMethod}|${encodedEmail}`;
  return `${payload}.${sign(payload)}`;
}

export function resolveSessionFromToken(token: string | undefined | null): AuthSession {
  if (!token) {
    return { role: "visitor" };
  }

  const dotIndex = token.lastIndexOf(".");
  if (dotIndex < 0) {
    return { role: "visitor" };
  }

  const payload = token.slice(0, dotIndex);
  const providedSignature = token.slice(dotIndex + 1);
  if (!payload || !providedSignature) {
    return { role: "visitor" };
  }

  const expectedSignature = sign(payload);
  if (!safeEqual(expectedSignature, providedSignature)) {
    return { role: "visitor" };
  }

  if (payload.startsWith("v1:")) {
    const [version, role] = payload.split(":");
    if (version !== "v1" || !role || !isUserRole(role)) {
      return { role: "visitor" };
    }
    return { role };
  }

  const [version, roleRaw, methodRaw, encodedEmail = ""] = payload.split("|");
  if (version !== "v2" || !roleRaw || !isUserRole(roleRaw)) {
    return { role: "visitor" };
  }
  if (!methodRaw || !isAuthMethod(methodRaw)) {
    return { role: roleRaw };
  }

  const decodedEmail = encodedEmail ? decodeEmailFromSession(encodedEmail) : "";
  const email = decodedEmail && isLikelyEmail(decodedEmail) ? normalizeEmail(decodedEmail) : undefined;

  return {
    role: roleRaw,
    authMethod: methodRaw,
    email,
  };
}

export function resolveRoleFromSession(token: string | undefined | null): UserRole {
  return resolveSessionFromToken(token).role;
}

export function getSessionFromCookieHeader(cookieHeader: string | null | undefined): AuthSession {
  if (!cookieHeader) {
    return { role: "visitor" };
  }

  const cookieMap = parseCookieHeader(cookieHeader);
  const rawValue = cookieMap[ROLE_COOKIE_NAME];
  if (!rawValue) {
    return { role: "visitor" };
  }

  try {
    return resolveSessionFromToken(decodeURIComponent(rawValue));
  } catch {
    return resolveSessionFromToken(rawValue);
  }
}

export function getRoleFromCookieHeader(cookieHeader: string | null | undefined): UserRole {
  return getSessionFromCookieHeader(cookieHeader).role;
}

export function getRoleFromRequest(request: Request): UserRole {
  return getRoleFromCookieHeader(request.headers.get("cookie"));
}

export async function getCurrentUserRole() {
  const session = await getCurrentAuthSession();
  return session.role;
}

async function resolveValidatedSession(session: AuthSession): Promise<AuthSession> {
  if (session.role === "visitor") {
    return session;
  }

  if (session.authMethod === "otp" && session.email) {
    if (!isDatabaseEnabled()) {
      return { role: "visitor" };
    }

    const result = await dbQuery<ActiveUserRow>(
      `
        SELECT role, is_active
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [session.email],
    );

    if (result.rowCount === 0) {
      return { role: "visitor" };
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return { role: "visitor" };
    }
    if (user.role !== "admin" && user.role !== "whitelisted") {
      return { role: "visitor" };
    }

    return {
      ...session,
      role: user.role,
      email: session.email,
    };
  }

  return { role: "visitor" };
}

export async function getCurrentAuthSession() {
  const cookieStore = await cookies();
  const session = resolveSessionFromToken(cookieStore.get(ROLE_COOKIE_NAME)?.value);
  return resolveValidatedSession(session);
}

export async function getAuthSessionFromRequest(request: Request) {
  const session = getSessionFromCookieHeader(request.headers.get("cookie"));
  return resolveValidatedSession(session);
}

export async function getRoleFromRequestAsync(request: Request) {
  const session = await getAuthSessionFromRequest(request);
  return session.role;
}

export async function requestLoginOtp(
  email: string,
): Promise<
  | { ok: true; email: string; expiresAt: string }
  | {
      ok: false;
      reason:
        | "db_unavailable"
        | "invalid_email"
        | "not_allowed"
        | "rate_limited"
        | "delivery_unavailable"
        | "delivery_failed";
      retryAfterSeconds?: number;
    }
> {
  const normalizedEmail = normalizeEmail(email);
  if (!isLikelyEmail(normalizedEmail)) {
    return { ok: false, reason: "invalid_email" };
  }

  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  try {
    const userResult = await dbQuery<ActiveUserRow>(
      `
        SELECT role, is_active
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [normalizedEmail],
    );

    if (userResult.rowCount === 0) {
      return { ok: false, reason: "not_allowed" };
    }

    const user = userResult.rows[0];
    if (!user.is_active || (user.role !== "admin" && user.role !== "whitelisted")) {
      return { ok: false, reason: "not_allowed" };
    }

    const latestOtpResult = await dbQuery<OtpRequestThrottleRow>(
      `
        SELECT created_at
        FROM auth_email_otps
        WHERE email = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [normalizedEmail],
    );

    if ((latestOtpResult.rowCount || 0) > 0) {
      const latestCreatedAt = new Date(
        normalizeDateToIsoString(latestOtpResult.rows[0].created_at),
      ).getTime();
      if (!Number.isNaN(latestCreatedAt)) {
        const elapsedSeconds = Math.floor((Date.now() - latestCreatedAt) / 1000);
        if (elapsedSeconds < OTP_MIN_RESEND_INTERVAL_SECONDS) {
          return {
            ok: false,
            reason: "rate_limited",
            retryAfterSeconds: OTP_MIN_RESEND_INTERVAL_SECONDS - elapsedSeconds,
          };
        }
      }
    }

    const code = createOtpCode();
    const codeHash = hashOtpCode(normalizedEmail, code);

    const createdOtp = await withTransaction(async (client) => {
      await client.query(
        `
          UPDATE auth_email_otps
          SET consumed_at = NOW(),
              consumed_reason = 'replaced'
          WHERE email = $1
            AND consumed_at IS NULL
            AND expires_at > NOW()
        `,
        [normalizedEmail],
      );

      const inserted = await client.query<CreatedOtpRow>(
        `
          INSERT INTO auth_email_otps (
            email,
            code_hash,
            expires_at,
            attempts,
            created_at
          )
          VALUES (
            $1,
            $2,
            NOW() + make_interval(mins => $3),
            0,
            NOW()
          )
          RETURNING id, expires_at
        `,
        [normalizedEmail, codeHash, OTP_EXPIRY_MINUTES],
      );

      return inserted.rows[0];
    });

    const delivery = await sendLoginOtp({
      email: normalizedEmail,
      code,
      expiresMinutes: OTP_EXPIRY_MINUTES,
    });

    if (!delivery.ok) {
      await dbQuery(
        `
          UPDATE auth_email_otps
          SET consumed_at = NOW(),
              consumed_reason = 'replaced'
          WHERE id = $1
            AND consumed_at IS NULL
        `,
        [createdOtp.id],
      );

      return {
        ok: false,
        reason:
          delivery.reason === "provider_unavailable" ? "delivery_unavailable" : "delivery_failed",
      };
    }

    return {
      ok: true,
      email: normalizedEmail,
      expiresAt: normalizeDateToIsoString(createdOtp.expires_at),
    };
  } catch (error) {
    if (isMissingOtpStorageError(error)) {
      return { ok: false, reason: "db_unavailable" };
    }
    throw error;
  }
}

export async function verifyLoginOtp(
  email: string,
  otpCode: string,
): Promise<
  | { ok: true; role: "whitelisted" | "admin"; email: string }
  | {
      ok: false;
      reason: "db_unavailable" | "invalid_email" | "invalid_code" | "invalid_or_expired" | "not_allowed";
    }
> {
  const normalizedEmail = normalizeEmail(email);
  if (!isLikelyEmail(normalizedEmail)) {
    return { ok: false, reason: "invalid_email" };
  }

  const normalizedOtpCode = normalizeOtpCode(otpCode);
  if (!isValidOtpCode(normalizedOtpCode)) {
    return { ok: false, reason: "invalid_code" };
  }

  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  try {
    return withTransaction(async (client) => {
      const userResult = await client.query<ActiveUserRow>(
        `
          SELECT role, is_active
          FROM users
          WHERE email = $1
          LIMIT 1
          FOR UPDATE
        `,
        [normalizedEmail],
      );

      if (userResult.rowCount === 0) {
        return { ok: false as const, reason: "not_allowed" as const };
      }

      const user = userResult.rows[0];
      if (!user.is_active || (user.role !== "admin" && user.role !== "whitelisted")) {
        return { ok: false as const, reason: "not_allowed" as const };
      }

      const otpResult = await client.query<OtpValidationRow>(
        `
          SELECT id, code_hash, attempts
          FROM auth_email_otps
          WHERE email = $1
            AND consumed_at IS NULL
            AND expires_at > NOW()
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [normalizedEmail],
      );

      if (otpResult.rowCount === 0) {
        return { ok: false as const, reason: "invalid_or_expired" as const };
      }

      const otp = otpResult.rows[0];
      const currentAttempts = Number.isFinite(otp.attempts) ? otp.attempts : 0;
      if (currentAttempts >= OTP_MAX_ATTEMPTS) {
        await client.query(
          `
            UPDATE auth_email_otps
            SET consumed_at = NOW(),
                consumed_reason = 'too_many_attempts'
            WHERE id = $1
              AND consumed_at IS NULL
          `,
          [otp.id],
        );
        return { ok: false as const, reason: "invalid_or_expired" as const };
      }

      const expectedHash = hashOtpCode(normalizedEmail, normalizedOtpCode);
      if (!safeEqual(expectedHash, otp.code_hash)) {
        const nextAttempts = currentAttempts + 1;
        if (nextAttempts >= OTP_MAX_ATTEMPTS) {
          await client.query(
            `
              UPDATE auth_email_otps
              SET attempts = $2,
                  consumed_at = NOW(),
                  consumed_reason = 'too_many_attempts'
              WHERE id = $1
            `,
            [otp.id, nextAttempts],
          );
        } else {
          await client.query(
            `
              UPDATE auth_email_otps
              SET attempts = $2
              WHERE id = $1
            `,
            [otp.id, nextAttempts],
          );
        }
        return { ok: false as const, reason: "invalid_code" as const };
      }

      await client.query(
        `
          UPDATE auth_email_otps
          SET consumed_at = NOW(),
              consumed_reason = 'verified'
          WHERE id = $1
        `,
        [otp.id],
      );

      return {
        ok: true as const,
        role: user.role,
        email: normalizedEmail,
      };
    });
  } catch (error) {
    if (isMissingOtpStorageError(error)) {
      return { ok: false, reason: "db_unavailable" };
    }
    throw error;
  }
}

export async function getManagedUsers(
  limit = 500,
): Promise<{ ok: true; users: ManagedUserItem[] } | { ok: false; reason: "db_unavailable" }> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  const boundedLimit = Math.max(1, Math.min(2000, Math.floor(limit)));
  const result = await dbQuery<ManagedUserRow>(
    `
      SELECT email, role, is_active, created_at, updated_at
      FROM users
      WHERE is_active = TRUE
      ORDER BY is_active DESC, role ASC, updated_at DESC, email ASC
      LIMIT $1
    `,
    [boundedLimit],
  );

  const users = result.rows.map((row) => ({
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : row.updated_at.toISOString(),
  }));

  return { ok: true, users };
}

export async function getDeletedUsers(
  limit = 500,
): Promise<{ ok: true; users: DeletedUserItem[] } | { ok: false; reason: "db_unavailable" }> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  const boundedLimit = Math.max(1, Math.min(2000, Math.floor(limit)));
  const result = await dbQuery<DeletedUserRow>(
    `
      SELECT email, deleted_at
      FROM deleted_users
      ORDER BY deleted_at DESC, email ASC
      LIMIT $1
    `,
    [boundedLimit],
  );

  const users = result.rows.map((row) => ({
    email: row.email,
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : row.deleted_at.toISOString(),
  }));

  return { ok: true, users };
}

export async function upsertUsers(
  emails: string[],
  role: "whitelisted" | "admin",
): Promise<{ ok: true; count: number } | { ok: false; reason: "db_unavailable" }> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  const uniqueEmails = Array.from(
    new Set(emails.map((email) => normalizeEmail(email)).filter((email) => isLikelyEmail(email))),
  );

  if (uniqueEmails.length === 0) {
    return { ok: true, count: 0 };
  }

  await withTransaction(async (client) => {
    for (const email of uniqueEmails) {
      await client.query(
        `
          DELETE FROM deleted_users
          WHERE email = $1
        `,
        [email],
      );
      await client.query(
        `
          INSERT INTO users (email, role, password_hash, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, TRUE, NOW(), NOW())
          ON CONFLICT (email) DO UPDATE
          SET role = EXCLUDED.role,
              is_active = TRUE,
              updated_at = NOW()
        `,
        [email, role, OTP_ONLY_PASSWORD_HASH],
      );
    }
  });

  return { ok: true, count: uniqueEmails.length };
}

export async function updateUserRole(
  email: string,
  role: "whitelisted" | "admin",
): Promise<
  | { ok: true; user: ManagedUserItem }
  | { ok: false; reason: "db_unavailable" | "invalid_email" | "not_found" }
> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isLikelyEmail(normalizedEmail)) {
    return { ok: false, reason: "invalid_email" };
  }

  const result = await dbQuery<ManagedUserRow>(
    `
      UPDATE users
      SET role = $2,
          updated_at = NOW()
      WHERE email = $1
      RETURNING email, role, is_active, created_at, updated_at
    `,
    [normalizedEmail, role],
  );

  if (result.rows.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const user = result.rows[0];
  return {
    ok: true,
    user: {
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      createdAt: typeof user.created_at === "string" ? user.created_at : user.created_at.toISOString(),
      updatedAt: typeof user.updated_at === "string" ? user.updated_at : user.updated_at.toISOString(),
    },
  };
}

export async function deleteUser(
  email: string,
): Promise<{ ok: true } | { ok: false; reason: "db_unavailable" | "invalid_email" | "not_found" }> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isLikelyEmail(normalizedEmail)) {
    return { ok: false, reason: "invalid_email" };
  }

  return withTransaction(async (client) => {
    const result = await client.query<{ email: string }>(
      `
        DELETE FROM users
        WHERE email = $1
        RETURNING email
      `,
      [normalizedEmail],
    );

    if (result.rows.length === 0) {
      return { ok: false as const, reason: "not_found" as const };
    }

    await client.query(
      `
        INSERT INTO deleted_users (email, deleted_at)
        VALUES ($1, NOW())
        ON CONFLICT (email) DO UPDATE
        SET deleted_at = EXCLUDED.deleted_at
      `,
      [normalizedEmail],
    );

    return { ok: true as const };
  });
}

export function canViewContactInfo(role: UserRole) {
  return role === "whitelisted" || role === "admin";
}

export function canViewOwnerContactInfo(role: UserRole) {
  if (canViewContactInfo(role)) {
    return true;
  }

  return parseBooleanEnvFlag(process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS);
}

export function canSubmitReviews(role: UserRole) {
  return role === "whitelisted" || role === "admin";
}

export function canAccessAdmin(role: UserRole) {
  return role === "admin";
}

export function buildRoleCookie(
  role: Exclude<UserRole, "visitor">,
  options?: { authMethod?: AuthMethod; email?: string; trustDevice?: boolean },
) {
  const maxAgeSeconds =
    typeof options?.trustDevice === "boolean"
      ? options.trustDevice
        ? ROLE_COOKIE_TRUSTED_DEVICE_MAX_AGE_SECONDS
        : undefined
      : ROLE_COOKIE_DEFAULT_MAX_AGE_SECONDS;

  return {
    name: ROLE_COOKIE_NAME,
    value: createRoleSession(role, options),
    path: "/",
    ...(typeof maxAgeSeconds === "number" ? { maxAge: maxAgeSeconds } : {}),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function buildRoleCookieClear() {
  return {
    name: ROLE_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

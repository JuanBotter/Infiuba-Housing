import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { cookies } from "next/headers";

import { dbQuery, isDatabaseEnabled, withTransaction } from "@/lib/db";
import { sendLoginOtp } from "@/lib/otp-mailer";
import type { AuthMethod, UserRole } from "@/types";

export const ROLE_COOKIE_NAME = "infiuba_role";

const ROLE_COOKIE_DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 120;
const ROLE_COOKIE_TRUSTED_DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_HASH_PREFIX = "scrypt";
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 200;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const OTP_CODE_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 15;
const OTP_MIN_RESEND_INTERVAL_SECONDS = 45;
const OTP_MAX_ATTEMPTS = 5;

let runtimeSecret: string | null = null;

function isUserRole(value: string): value is UserRole {
  return value === "visitor" || value === "whitelisted" || value === "admin";
}

function isAuthMethod(value: string): value is AuthMethod {
  return value === "code" || value === "password" || value === "invite" || value === "otp";
}

function parseCodes(raw: string | undefined) {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[\n,;]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBooleanEnvFlag(raw: string | undefined) {
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isMissingConsumedReasonError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const column = "column" in error ? (error as { column?: unknown }).column : undefined;
  const message = "message" in error ? (error as { message?: unknown }).message : undefined;

  if (code !== "42703") {
    return false;
  }

  if (typeof column === "string" && column === "consumed_reason") {
    return true;
  }

  return typeof message === "string" && message.includes("consumed_reason");
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

interface UserCredentialRow {
  role: string;
  password_hash: string;
  is_active: boolean;
}

interface ManagedUserRow {
  email: string;
  role: "whitelisted" | "admin";
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

interface InviteRow {
  id: number;
  email: string;
  role: "whitelisted" | "admin";
}

interface InviteHistoryRow {
  id: number;
  email: string;
  role: "whitelisted" | "admin";
  created_at: string | Date;
  expires_at: string | Date;
  consumed_at: string | Date | null;
  consumed_reason: string | null;
  created_by_email: string | null;
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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function derivePasswordHash(password: string, salt: Buffer) {
  return scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
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

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createInviteToken() {
  return randomBytes(24).toString("base64url");
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

export function hashPasswordForStorage(password: string) {
  const normalizedPassword = password.trim();
  if (
    normalizedPassword.length < PASSWORD_MIN_LENGTH ||
    normalizedPassword.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `Password must contain between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }

  const salt = randomBytes(16);
  const hash = derivePasswordHash(normalizedPassword, salt);
  return `${PASSWORD_HASH_PREFIX}:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString(
    "hex",
  )}:${hash.toString("hex")}`;
}

export function verifyPasswordAgainstHash(password: string, storedHash: string) {
  const normalizedPassword = password.trim();
  if (
    normalizedPassword.length < PASSWORD_MIN_LENGTH ||
    normalizedPassword.length > PASSWORD_MAX_LENGTH
  ) {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 6) {
    return false;
  }

  const [algorithm, nString, rString, pString, saltHex, hashHex] = parts;
  if (algorithm !== PASSWORD_HASH_PREFIX) {
    return false;
  }

  const n = Number(nString);
  const r = Number(rString);
  const p = Number(pString);
  if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) {
    return false;
  }

  if (!saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedHash = Buffer.from(hashHex, "hex");
  if (expectedHash.length === 0 || salt.length === 0) {
    return false;
  }

  const derived = derivePasswordHash(normalizedPassword, salt);
  if (derived.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(derived, expectedHash);
}

function getSigningSecret() {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) {
    return configured;
  }

  const adminToken = process.env.ADMIN_TOKEN?.trim();
  if (adminToken) {
    return adminToken;
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

  // Legacy access-code sessions are no longer accepted.
  if (session.authMethod === "code") {
    return { role: "visitor" };
  }

  if (
    (session.authMethod === "otp" ||
      session.authMethod === "password" ||
      session.authMethod === "invite") &&
    session.email
  ) {
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

export function resolveRoleForAccessCode(code: string): UserRole | null {
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    return null;
  }

  const adminCodes = new Set([
    ...parseCodes(process.env.ADMIN_TOKEN),
    ...parseCodes(process.env.ADMIN_TOKENS),
  ]);
  if (adminCodes.has(normalizedCode)) {
    return "admin";
  }

  const whitelistedCodes = new Set([
    ...parseCodes(process.env.WHITELIST_TOKEN),
    ...parseCodes(process.env.WHITELIST_TOKENS),
  ]);
  if (whitelistedCodes.has(normalizedCode)) {
    return "whitelisted";
  }

  return null;
}

export async function resolveRoleForCredentials(
  email: string,
  password: string,
): Promise<Exclude<UserRole, "visitor"> | null | "db_unavailable"> {
  if (!isDatabaseEnabled()) {
    return "db_unavailable";
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isLikelyEmail(normalizedEmail)) {
    return null;
  }

  const result = await dbQuery<UserCredentialRow>(
    `
      SELECT role, password_hash, is_active
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const user = result.rows[0];
  if (!user.is_active) {
    return null;
  }
  if (!verifyPasswordAgainstHash(password, user.password_hash)) {
    return null;
  }
  if (user.role === "admin" || user.role === "whitelisted") {
    return user.role;
  }

  return null;
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

export async function revokeUserAccess(
  email: string,
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
      SET is_active = FALSE,
          updated_at = NOW()
      WHERE email = $1
      RETURNING email, role, is_active, created_at, updated_at
    `,
    [normalizedEmail],
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

export interface CreateInviteInput {
  email: string;
  role: "whitelisted" | "admin";
  expiresHours?: number;
  createdByEmail?: string;
}

export interface InviteHistoryItem {
  id: number;
  email: string;
  role: "whitelisted" | "admin";
  status: "open" | "activated" | "replaced" | "expired";
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  consumedReason?: "activated" | "replaced";
  createdByEmail?: string;
}

export async function createInviteLink(
  input: CreateInviteInput,
): Promise<
  | { ok: true; token: string; email: string; role: "whitelisted" | "admin"; expiresAt: string }
  | { ok: false; reason: "db_unavailable" | "invalid_email" }
> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  const normalizedEmail = normalizeEmail(input.email);
  if (!isLikelyEmail(normalizedEmail)) {
    return { ok: false, reason: "invalid_email" };
  }

  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const boundedHours = Number.isFinite(input.expiresHours)
    ? Math.min(24 * 30, Math.max(1, Math.floor(input.expiresHours || 0)))
    : 24 * 7;

  const result = await withTransaction(async (client) => {
    // Only keep one open invite per email: creating a new one invalidates older open invites.
    try {
      await client.query(
        `
          UPDATE auth_invites
          SET consumed_at = NOW(),
              consumed_reason = 'superseded'
          WHERE email = $1
            AND consumed_at IS NULL
            AND expires_at > NOW()
        `,
        [normalizedEmail],
      );
    } catch (error) {
      if (!isMissingConsumedReasonError(error)) {
        throw error;
      }

      // Backward compatibility for DBs that have not run the latest migration yet.
      await client.query(
        `
          UPDATE auth_invites
          SET consumed_at = NOW()
          WHERE email = $1
            AND consumed_at IS NULL
            AND expires_at > NOW()
        `,
        [normalizedEmail],
      );
    }

    return client.query<{ expires_at: string | Date }>(
      `
        INSERT INTO auth_invites (
          email,
          role,
          token_hash,
          expires_at,
          created_by_email
        )
        VALUES (
          $1,
          $2,
          $3,
          NOW() + make_interval(hours => $4),
          $5
        )
        RETURNING expires_at
      `,
      [
        normalizedEmail,
        input.role,
        tokenHash,
        boundedHours,
        input.createdByEmail ? normalizeEmail(input.createdByEmail) : null,
      ],
    );
  });

  return {
    ok: true,
    token,
    email: normalizedEmail,
    role: input.role,
    expiresAt:
      typeof result.rows[0].expires_at === "string"
        ? result.rows[0].expires_at
        : result.rows[0].expires_at.toISOString(),
  };
}

export async function getInviteHistory(
  limit = 250,
): Promise<{ ok: true; invites: InviteHistoryItem[] } | { ok: false; reason: "db_unavailable" }> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  const boundedLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  let result;
  try {
    result = await dbQuery<InviteHistoryRow>(
      `
        SELECT
          id,
          email,
          role,
          created_at,
          expires_at,
          consumed_at,
          consumed_reason,
          created_by_email
        FROM auth_invites
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [boundedLimit],
    );
  } catch (error) {
    if (!isMissingConsumedReasonError(error)) {
      throw error;
    }

    // Backward compatibility for DBs that have not run the latest migration yet.
    result = await dbQuery<InviteHistoryRow>(
      `
        SELECT
          id,
          email,
          role,
          created_at,
          expires_at,
          consumed_at,
          NULL::text AS consumed_reason,
          created_by_email
        FROM auth_invites
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [boundedLimit],
    );
  }

  const now = Date.now();
  const invites = result.rows.map((row) => {
    const createdAt =
      typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString();
    const expiresAt =
      typeof row.expires_at === "string" ? row.expires_at : row.expires_at.toISOString();
    const consumedAt = row.consumed_at
      ? typeof row.consumed_at === "string"
        ? row.consumed_at
        : row.consumed_at.toISOString()
      : undefined;
    const consumedReason =
      row.consumed_reason === "activated"
        ? "activated"
        : row.consumed_reason === "superseded" || row.consumed_reason === "replaced"
          ? "replaced"
          : undefined;
    const isExpired = !consumedAt && new Date(expiresAt).getTime() <= now;
    const status: InviteHistoryItem["status"] = consumedAt
      ? consumedReason === "replaced"
        ? "replaced"
        : "activated"
      : isExpired
        ? "expired"
        : "open";

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status,
      createdAt,
      expiresAt,
      consumedAt,
      consumedReason,
      createdByEmail: row.created_by_email || undefined,
    } satisfies InviteHistoryItem;
  });

  return { ok: true, invites };
}

export async function activateInviteWithPassword(
  token: string,
  password: string,
): Promise<
  | { ok: true; role: "whitelisted" | "admin"; email: string }
  | { ok: false; reason: "db_unavailable" | "invalid_or_expired" | "invalid_password" }
> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  let passwordHash = "";
  try {
    passwordHash = hashPasswordForStorage(password);
  } catch {
    return { ok: false, reason: "invalid_password" };
  }

  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  const tokenHash = hashInviteToken(normalizedToken);

  return withTransaction(async (client) => {
    const inviteResult = await client.query<InviteRow>(
      `
        SELECT id, email, role
        FROM auth_invites
        WHERE token_hash = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
        FOR UPDATE
      `,
      [tokenHash],
    );

    if (inviteResult.rowCount === 0) {
      return { ok: false as const, reason: "invalid_or_expired" as const };
    }

    const invite = inviteResult.rows[0];

    await client.query(
      `
        INSERT INTO users (email, role, password_hash, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, TRUE, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE
        SET role = EXCLUDED.role,
            password_hash = EXCLUDED.password_hash,
            is_active = TRUE,
            updated_at = NOW()
      `,
      [invite.email, invite.role, passwordHash],
    );

    try {
      await client.query(
        `
          UPDATE auth_invites
          SET consumed_at = NOW(),
              consumed_reason = 'activated'
          WHERE id = $1
        `,
        [invite.id],
      );
    } catch (error) {
      if (!isMissingConsumedReasonError(error)) {
        throw error;
      }

      // Backward compatibility for DBs that have not run the latest migration yet.
      await client.query(
        `
          UPDATE auth_invites
          SET consumed_at = NOW()
          WHERE id = $1
        `,
        [invite.id],
      );
    }

    return { ok: true as const, role: invite.role, email: invite.email };
  });
}

export async function isInviteTokenActive(
  token: string,
): Promise<
  { ok: true; active: boolean; email?: string; role?: "whitelisted" | "admin" }
  | { ok: false; reason: "db_unavailable" }
> {
  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return { ok: true, active: false };
  }

  const tokenHash = hashInviteToken(normalizedToken);
  const result = await dbQuery<{ id: number; email: string; role: "whitelisted" | "admin" }>(
    `
      SELECT id, email, role
      FROM auth_invites
      WHERE token_hash = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash],
  );

  if (result.rows.length === 0) {
    return { ok: true, active: false };
  }

  const invite = result.rows[0];
  return { ok: true, active: true, email: invite.email, role: invite.role };
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

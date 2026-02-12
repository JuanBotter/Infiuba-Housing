import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { dbQuery, isDatabaseEnabled, withTransaction } from "@/lib/db";
import { sendLoginOtp } from "@/lib/otp-mailer";
import type { AuthMethod, Lang, UserRole } from "@/types";

export const ROLE_COOKIE_NAME = "infiuba_role";
export const MAGIC_LINK_STATE_COOKIE_NAME = "infiuba_magic_state";

const ROLE_COOKIE_DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 120;
const ROLE_COOKIE_TRUSTED_DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const OTP_ONLY_PASSWORD_HASH = "otp-only";
const OTP_CODE_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 15;
const OTP_MIN_RESEND_INTERVAL_SECONDS = 45;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_WINDOW_SECONDS = 60 * 10;
const OTP_REQUEST_MAX_PER_IP = 5;
const OTP_REQUEST_MAX_PER_SUBNET = 30;
const OTP_REQUEST_GLOBAL_SOFT_LIMIT = 1_000_000_000;
const OTP_VERIFY_FAILURE_MAX_PER_IP = 20;
const OTP_VERIFY_FAILURE_MAX_PER_EMAIL_IP = 8;
const OTP_RATE_LIMIT_RETENTION_SECONDS = 60 * 60 * 24;
const OTP_RATE_LIMIT_GC_INTERVAL_MS = 60 * 60 * 1000;
const OTP_RATE_LIMIT_UNKNOWN_NETWORK_KEY = "unknown";
const OTP_RATE_LIMIT_GLOBAL_KEY = "global";
const OTP_RATE_LIMIT_SCOPE_REQUEST_IP = "otp_request_ip";
const OTP_RATE_LIMIT_SCOPE_REQUEST_SUBNET = "otp_request_subnet";
const OTP_RATE_LIMIT_SCOPE_REQUEST_GLOBAL = "otp_request_global";
const OTP_RATE_LIMIT_SCOPE_VERIFY_FAILURE_IP = "otp_verify_failure_ip";
const OTP_RATE_LIMIT_SCOPE_VERIFY_FAILURE_EMAIL_IP = "otp_verify_failure_email_ip";
const OTP_MAGIC_LINK_VERSION = "v1";
const OTP_MAGIC_LINK_SIGNING_CONTEXT = "otp_magic_link";
const OTP_MAGIC_LINK_STATE_LENGTH_BYTES = 24;
const OTP_MAGIC_LINK_STATE_MAX_AGE_SECONDS = OTP_EXPIRY_MINUTES * 60;
const MAGIC_LINK_STATE_PATTERN = /^[A-Za-z0-9_-]{24,200}$/;
const OTP_LOGO_CACHE_BUST_VERSION = "20260209";
const AUTH_SECRET_MIN_LENGTH = 32;
const VISITOR_CONTACT_OVERRIDE_PROD_ACK_ENV = "VISITOR_CAN_VIEW_OWNER_CONTACTS_ALLOW_PRODUCTION";
const AUTH_SECRET_WEAK_VALUES = new Set([
  "replace-with-a-long-random-secret",
  "changeme",
  "change-me",
  "secret",
  "password",
  "infiuba",
]);

let runtimeSecret: string | null = null;
let lastRateLimitCleanupAt = 0;
let hasWarnedAuthSecretFallback = false;
let hasWarnedWeakAuthSecret = false;
let hasWarnedVisitorOwnerOverride = false;

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
  return (
    typeof message === "string" &&
    (message.includes("auth_email_otps") || message.includes("auth_rate_limit_buckets"))
  );
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

interface OtpRateLimitBucketRow {
  hits: number;
}

interface OtpRateLimitRule {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface OtpRateLimitContext {
  ipKey?: string;
  subnetKey?: string;
}

export interface RequestLoginOtpOptions {
  lang?: Lang;
  appOrigin?: string;
  magicLinkState?: string;
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

function normalizeMagicLinkState(value: string | undefined) {
  const normalized = value?.trim() || "";
  if (!normalized) {
    return "";
  }
  return MAGIC_LINK_STATE_PATTERN.test(normalized) ? normalized : "";
}

export function createMagicLinkState() {
  return randomBytes(OTP_MAGIC_LINK_STATE_LENGTH_BYTES).toString("base64url");
}

function resolveAppOrigin(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) {
    return "";
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.origin;
  } catch {
    return "";
  }
}

function createOtpMagicLinkToken(
  email: string,
  code: string,
  expiresAt: string,
  magicLinkState: string,
) {
  const payload = JSON.stringify({
    v: OTP_MAGIC_LINK_VERSION,
    email: normalizeEmail(email),
    code: normalizeOtpCode(code),
    exp: expiresAt,
    state: magicLinkState,
  });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const signature = sign(`${OTP_MAGIC_LINK_SIGNING_CONTEXT}|${encodedPayload}`);
  return `${encodedPayload}.${signature}`;
}

function appendVersionQuery(rawUrl: string, version: string) {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.searchParams.has("v")) {
      parsed.searchParams.set("v", version);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function resolveOtpLogoUrl(appOrigin: string) {
  const configured = process.env.OTP_LOGO_URL?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return appendVersionQuery(parsed.toString(), OTP_LOGO_CACHE_BUST_VERSION);
      }
    } catch {
      // Ignore invalid configured logo URL and fall back to app-hosted public asset.
    }
  }

  if (!appOrigin) {
    return undefined;
  }

  return appendVersionQuery(`${appOrigin}/infiuba-logo.png`, OTP_LOGO_CACHE_BUST_VERSION);
}

export function resolveOtpMagicLinkToken(
  token: string,
): { ok: true; email: string; otpCode: string; magicLinkState: string } | { ok: false } {
  const trimmed = token.trim();
  const separatorIndex = trimmed.lastIndexOf(".");
  if (!trimmed || separatorIndex < 0) {
    return { ok: false };
  }

  const encodedPayload = trimmed.slice(0, separatorIndex);
  const providedSignature = trimmed.slice(separatorIndex + 1);
  if (!encodedPayload || !providedSignature) {
    return { ok: false };
  }

  const expectedSignature = sign(`${OTP_MAGIC_LINK_SIGNING_CONTEXT}|${encodedPayload}`);
  if (!safeEqual(expectedSignature, providedSignature)) {
    return { ok: false };
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      v?: unknown;
      email?: unknown;
      code?: unknown;
      exp?: unknown;
      state?: unknown;
    };

    if (parsed.v !== OTP_MAGIC_LINK_VERSION) {
      return { ok: false };
    }

    const email = typeof parsed.email === "string" ? normalizeEmail(parsed.email) : "";
    const otpCode = typeof parsed.code === "string" ? normalizeOtpCode(parsed.code) : "";
    const expiresAt = typeof parsed.exp === "string" ? new Date(parsed.exp).getTime() : Number.NaN;
    const magicLinkState =
      typeof parsed.state === "string" ? normalizeMagicLinkState(parsed.state) : "";

    if (
      !isLikelyEmail(email) ||
      !isValidOtpCode(otpCode) ||
      Number.isNaN(expiresAt) ||
      !magicLinkState
    ) {
      return { ok: false };
    }
    if (expiresAt <= Date.now()) {
      return { ok: false };
    }

    return {
      ok: true,
      email,
      otpCode,
      magicLinkState,
    };
  } catch {
    return { ok: false };
  }
}

function normalizeDateToIsoString(value: string | Date) {
  return typeof value === "string" ? value : value.toISOString();
}

function resolveRateLimitContext(context?: OtpRateLimitContext) {
  const ipKey = context?.ipKey?.trim() || OTP_RATE_LIMIT_UNKNOWN_NETWORK_KEY;
  const subnetKey = context?.subnetKey?.trim() || ipKey;
  return { ipKey, subnetKey };
}

function buildRateLimitBucketKeyHash(scope: string, key: string) {
  return createHmac("sha256", getSigningSecret())
    .update(`${scope}|${key}`)
    .digest("hex");
}

function resolveRateLimitBucketStart(nowMs: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  return nowMs - (nowMs % windowMs);
}

function resolveRateLimitRetryAfterSeconds(nowMs: number, bucketStartMs: number, windowSeconds: number) {
  const elapsedSeconds = Math.floor((nowMs - bucketStartMs) / 1000);
  return Math.max(windowSeconds - elapsedSeconds, 1);
}

async function maybeCleanupRateLimitBuckets() {
  const now = Date.now();
  if (now - lastRateLimitCleanupAt < OTP_RATE_LIMIT_GC_INTERVAL_MS) {
    return;
  }
  lastRateLimitCleanupAt = now;

  await dbQuery(
    `
      DELETE FROM auth_rate_limit_buckets
      WHERE updated_at < NOW() - make_interval(secs => $1)
    `,
    [OTP_RATE_LIMIT_RETENTION_SECONDS],
  );
}

async function incrementRateLimitRule(rule: OtpRateLimitRule) {
  const nowMs = Date.now();
  const bucketStartMs = resolveRateLimitBucketStart(nowMs, rule.windowSeconds);
  const bucketStart = new Date(bucketStartMs).toISOString();
  const keyHash = buildRateLimitBucketKeyHash(rule.scope, rule.key);

  const result = await dbQuery<OtpRateLimitBucketRow>(
    `
      INSERT INTO auth_rate_limit_buckets (
        scope,
        bucket_key_hash,
        window_seconds,
        bucket_start,
        hits,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 1, NOW())
      ON CONFLICT (scope, bucket_key_hash, window_seconds, bucket_start)
      DO UPDATE
      SET hits = auth_rate_limit_buckets.hits + 1,
          updated_at = NOW()
      RETURNING hits
    `,
    [rule.scope, keyHash, rule.windowSeconds, bucketStart],
  );

  const hits = Number(result.rows[0]?.hits ?? 1);
  const retryAfterSeconds = resolveRateLimitRetryAfterSeconds(nowMs, bucketStartMs, rule.windowSeconds);

  return {
    hits,
    blocked: hits > rule.limit,
    retryAfterSeconds,
  };
}

async function getRateLimitRuleHits(rule: OtpRateLimitRule) {
  const nowMs = Date.now();
  const bucketStart = new Date(resolveRateLimitBucketStart(nowMs, rule.windowSeconds)).toISOString();
  const keyHash = buildRateLimitBucketKeyHash(rule.scope, rule.key);

  const result = await dbQuery<OtpRateLimitBucketRow>(
    `
      SELECT hits
      FROM auth_rate_limit_buckets
      WHERE scope = $1
        AND bucket_key_hash = $2
        AND window_seconds = $3
        AND bucket_start = $4
      LIMIT 1
    `,
    [rule.scope, keyHash, rule.windowSeconds, bucketStart],
  );

  const hits = Number(result.rows[0]?.hits ?? 0);
  return {
    hits,
    blocked: hits >= rule.limit,
  };
}

async function consumeRateLimitRules(rules: OtpRateLimitRule[]) {
  let blocked = false;
  let retryAfterSeconds = 1;

  for (const rule of rules) {
    const result = await incrementRateLimitRule(rule);
    if (result.blocked) {
      blocked = true;
      retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds);
    }
  }

  await maybeCleanupRateLimitBuckets();
  return {
    blocked,
    retryAfterSeconds,
  };
}

async function isBlockedByRateLimitRules(rules: OtpRateLimitRule[]) {
  for (const rule of rules) {
    const result = await getRateLimitRuleHits(rule);
    if (result.blocked) {
      return true;
    }
  }
  return false;
}

async function consumeOtpRequestRateLimits(context?: OtpRateLimitContext) {
  const network = resolveRateLimitContext(context);
  const scopedResult = await consumeRateLimitRules([
    {
      scope: OTP_RATE_LIMIT_SCOPE_REQUEST_IP,
      key: network.ipKey,
      limit: OTP_REQUEST_MAX_PER_IP,
      windowSeconds: OTP_RATE_LIMIT_WINDOW_SECONDS,
    },
    {
      scope: OTP_RATE_LIMIT_SCOPE_REQUEST_SUBNET,
      key: network.subnetKey,
      limit: OTP_REQUEST_MAX_PER_SUBNET,
      windowSeconds: OTP_RATE_LIMIT_WINDOW_SECONDS,
    },
  ]);

  // Global request volume is recorded for telemetry only and intentionally does not hard-block.
  await consumeRateLimitRules([
    {
      scope: OTP_RATE_LIMIT_SCOPE_REQUEST_GLOBAL,
      key: OTP_RATE_LIMIT_GLOBAL_KEY,
      limit: OTP_REQUEST_GLOBAL_SOFT_LIMIT,
      windowSeconds: OTP_RATE_LIMIT_WINDOW_SECONDS,
    },
  ]);

  return scopedResult;
}

async function isOtpVerifyFailureRateLimited(email: string, context?: OtpRateLimitContext) {
  const network = resolveRateLimitContext(context);
  return isBlockedByRateLimitRules([
    {
      scope: OTP_RATE_LIMIT_SCOPE_VERIFY_FAILURE_IP,
      key: network.ipKey,
      limit: OTP_VERIFY_FAILURE_MAX_PER_IP,
      windowSeconds: OTP_RATE_LIMIT_WINDOW_SECONDS,
    },
    {
      scope: OTP_RATE_LIMIT_SCOPE_VERIFY_FAILURE_EMAIL_IP,
      key: `${email}|${network.ipKey}`,
      limit: OTP_VERIFY_FAILURE_MAX_PER_EMAIL_IP,
      windowSeconds: OTP_RATE_LIMIT_WINDOW_SECONDS,
    },
  ]);
}

async function recordOtpVerifyFailure(email: string, context?: OtpRateLimitContext) {
  const network = resolveRateLimitContext(context);
  return consumeRateLimitRules([
    {
      scope: OTP_RATE_LIMIT_SCOPE_VERIFY_FAILURE_IP,
      key: network.ipKey,
      limit: OTP_VERIFY_FAILURE_MAX_PER_IP,
      windowSeconds: OTP_RATE_LIMIT_WINDOW_SECONDS,
    },
    {
      scope: OTP_RATE_LIMIT_SCOPE_VERIFY_FAILURE_EMAIL_IP,
      key: `${email}|${network.ipKey}`,
      limit: OTP_VERIFY_FAILURE_MAX_PER_EMAIL_IP,
      windowSeconds: OTP_RATE_LIMIT_WINDOW_SECONDS,
    },
  ]);
}

function getSigningSecret() {
  const configured = process.env.AUTH_SECRET?.trim() || "";
  const isProduction = process.env.NODE_ENV === "production";

  if (configured) {
    const normalized = configured.toLowerCase();
    const isTooShort = configured.length < AUTH_SECRET_MIN_LENGTH;
    const isWeakValue = AUTH_SECRET_WEAK_VALUES.has(normalized);
    if (isTooShort || isWeakValue) {
      const reason =
        isTooShort && isWeakValue
          ? `AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters and cannot be a known placeholder value.`
          : isTooShort
            ? `AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters.`
            : "AUTH_SECRET cannot use a known weak placeholder value.";

      if (isProduction) {
        throw new Error(`${reason} Refusing to run auth with insecure secret in production.`);
      }

      if (!hasWarnedWeakAuthSecret) {
        console.warn(`[AUTH] ${reason} This warning is allowed only in non-production environments.`);
        hasWarnedWeakAuthSecret = true;
      }
    }
    return configured;
  }

  if (isProduction) {
    throw new Error(
      `AUTH_SECRET is required in production and must be at least ${AUTH_SECRET_MIN_LENGTH} characters.`,
    );
  }

  if (!runtimeSecret) {
    runtimeSecret = randomBytes(32).toString("hex");
  }
  if (!hasWarnedAuthSecretFallback) {
    console.warn(
      "[AUTH] AUTH_SECRET is not set. Using in-memory fallback secret for non-production only; sessions reset on restart.",
    );
    hasWarnedAuthSecretFallback = true;
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
  rateLimitContext?: OtpRateLimitContext,
  options?: RequestLoginOtpOptions,
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
    const consumedRequestRateLimit = await consumeOtpRequestRateLimits(rateLimitContext);
    if (consumedRequestRateLimit.blocked) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAfterSeconds: consumedRequestRateLimit.retryAfterSeconds,
      };
    }

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

    const expiresAt = normalizeDateToIsoString(createdOtp.expires_at);
    const preferredLang = options?.lang || "es";
    const appOrigin = resolveAppOrigin(options?.appOrigin);
    const magicLinkState = normalizeMagicLinkState(options?.magicLinkState) || createMagicLinkState();
    const magicLinkToken = createOtpMagicLinkToken(normalizedEmail, code, expiresAt, magicLinkState);
    const magicLinkUrl = appOrigin
      ? `${appOrigin}/api/session/magic?token=${encodeURIComponent(magicLinkToken)}&lang=${preferredLang}`
      : undefined;
    const logoUrl = resolveOtpLogoUrl(appOrigin);

    const delivery = await sendLoginOtp({
      email: normalizedEmail,
      code,
      expiresMinutes: OTP_EXPIRY_MINUTES,
      lang: preferredLang,
      magicLinkUrl,
      logoUrl,
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
      expiresAt,
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
  rateLimitContext?: OtpRateLimitContext,
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

  if (!isDatabaseEnabled()) {
    return { ok: false, reason: "db_unavailable" };
  }

  try {
    const verifyFailureRateLimited = await isOtpVerifyFailureRateLimited(
      normalizedEmail,
      rateLimitContext,
    );
    if (verifyFailureRateLimited) {
      return { ok: false, reason: "invalid_or_expired" };
    }

    const normalizedOtpCode = normalizeOtpCode(otpCode);
    if (!isValidOtpCode(normalizedOtpCode)) {
      await recordOtpVerifyFailure(normalizedEmail, rateLimitContext);
      return { ok: false, reason: "invalid_code" };
    }

    const verification = await withTransaction(async (client) => {
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
        role: user.role as "whitelisted" | "admin",
        email: normalizedEmail,
      };
    });

    if (!verification.ok) {
      await recordOtpVerifyFailure(normalizedEmail, rateLimitContext);
    }
    return verification;
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
    await client.query(
      `
        DELETE FROM deleted_users
        WHERE email = ANY($1::text[])
      `,
      [uniqueEmails],
    );

    await client.query(
      `
        INSERT INTO users (email, role, password_hash, is_active, created_at, updated_at)
        SELECT
          email,
          $2::user_role_enum,
          $3,
          TRUE,
          NOW(),
          NOW()
        FROM UNNEST($1::text[]) AS input(email)
        ON CONFLICT (email) DO UPDATE
        SET role = EXCLUDED.role,
            is_active = TRUE,
            updated_at = NOW()
      `,
      [uniqueEmails, role, OTP_ONLY_PASSWORD_HASH],
    );
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

function isVisitorOwnerContactOverrideEnabled() {
  const enabled = parseBooleanEnvFlag(process.env.VISITOR_CAN_VIEW_OWNER_CONTACTS);
  if (!enabled) {
    return false;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const allowInProduction = parseBooleanEnvFlag(process.env[VISITOR_CONTACT_OVERRIDE_PROD_ACK_ENV]);
  if (isProduction && !allowInProduction) {
    throw new Error(
      `VISITOR_CAN_VIEW_OWNER_CONTACTS=true requires ${VISITOR_CONTACT_OVERRIDE_PROD_ACK_ENV}=true in production.`,
    );
  }

  if (!hasWarnedVisitorOwnerOverride) {
    const mode = isProduction ? "production" : "non-production";
    console.warn(
      `[AUTH] VISITOR_CAN_VIEW_OWNER_CONTACTS is enabled in ${mode}. Owner contacts are exposed to visitors.`,
    );
    hasWarnedVisitorOwnerOverride = true;
  }

  return true;
}

export function canViewOwnerContactInfo(role: UserRole) {
  if (canViewContactInfo(role)) {
    return true;
  }

  return isVisitorOwnerContactOverrideEnabled();
}

export function isVisitorOwnerContactOverrideActive() {
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

export function buildMagicLinkStateCookie(magicLinkState: string) {
  const normalized = normalizeMagicLinkState(magicLinkState);
  if (!normalized) {
    throw new Error("Cannot build magic-link state cookie with empty/invalid value.");
  }

  return {
    name: MAGIC_LINK_STATE_COOKIE_NAME,
    value: normalized,
    path: "/",
    maxAge: OTP_MAGIC_LINK_STATE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function buildMagicLinkStateCookieClear() {
  return {
    name: MAGIC_LINK_STATE_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function getMagicLinkStateFromCookieHeader(cookieHeader: string | null | undefined) {
  if (!cookieHeader) {
    return "";
  }

  const cookieMap = parseCookieHeader(cookieHeader);
  const stateValue = cookieMap[MAGIC_LINK_STATE_COOKIE_NAME];
  if (!stateValue) {
    return "";
  }

  try {
    return normalizeMagicLinkState(decodeURIComponent(stateValue));
  } catch {
    return normalizeMagicLinkState(stateValue);
  }
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

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import type { UserRole } from "@/types";

export const ROLE_COOKIE_NAME = "infiuba_role";

const ROLE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 120;

let runtimeSecret: string | null = null;

function isUserRole(value: string): value is UserRole {
  return value === "visitor" || value === "whitelisted" || value === "admin";
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

export function createRoleSession(role: Exclude<UserRole, "visitor">) {
  const payload = `v1:${role}`;
  return `${payload}.${sign(payload)}`;
}

export function resolveRoleFromSession(token: string | undefined | null): UserRole {
  if (!token) {
    return "visitor";
  }

  const dotIndex = token.lastIndexOf(".");
  if (dotIndex < 0) {
    return "visitor";
  }

  const payload = token.slice(0, dotIndex);
  const providedSignature = token.slice(dotIndex + 1);
  if (!payload || !providedSignature) {
    return "visitor";
  }

  const expectedSignature = sign(payload);
  if (!safeEqual(expectedSignature, providedSignature)) {
    return "visitor";
  }

  const [version, role] = payload.split(":");
  if (version !== "v1" || !role || !isUserRole(role)) {
    return "visitor";
  }

  return role;
}

export function getRoleFromCookieHeader(cookieHeader: string | null | undefined): UserRole {
  if (!cookieHeader) {
    return "visitor";
  }

  const cookieMap = parseCookieHeader(cookieHeader);
  const rawValue = cookieMap[ROLE_COOKIE_NAME];
  if (!rawValue) {
    return "visitor";
  }

  try {
    return resolveRoleFromSession(decodeURIComponent(rawValue));
  } catch {
    return resolveRoleFromSession(rawValue);
  }
}

export function getRoleFromRequest(request: Request): UserRole {
  return getRoleFromCookieHeader(request.headers.get("cookie"));
}

export async function getCurrentUserRole() {
  const cookieStore = await cookies();
  return resolveRoleFromSession(cookieStore.get(ROLE_COOKIE_NAME)?.value);
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

export function canViewContactInfo(role: UserRole) {
  return role === "whitelisted" || role === "admin";
}

export function canSubmitReviews(role: UserRole) {
  return role === "whitelisted" || role === "admin";
}

export function canAccessAdmin(role: UserRole) {
  return role === "admin";
}

export function buildRoleCookie(role: Exclude<UserRole, "visitor">) {
  return {
    name: ROLE_COOKIE_NAME,
    value: createRoleSession(role),
    path: "/",
    maxAge: ROLE_COOKIE_MAX_AGE_SECONDS,
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

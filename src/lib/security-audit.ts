import { createHmac, randomBytes } from "node:crypto";

import type { RequestNetworkFingerprint } from "@/lib/request-network";
import { dbQuery, isDatabaseEnabled } from "@/lib/db";

export type SecurityAuditEventType =
  | "auth.otp.request"
  | "auth.otp.verify"
  | "contact_edit.request"
  | "contact_edit.moderate"
  | "admin.user.update_role"
  | "admin.user.delete"
  | "admin.user.upsert"
  | "admin.review.moderate"
  | "admin.review.edit"
  | "admin.listing_images.reorder"
  | "admin.publication.update"
  | "admin.publication.delete_image";

interface SecurityAuditEventInput {
  eventType: SecurityAuditEventType;
  outcome: string;
  actorEmail?: string | null;
  targetEmail?: string | null;
  networkFingerprint?: RequestNetworkFingerprint;
  metadata?: Record<string, unknown>;
}

function normalizeEmail(value: string | null | undefined) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function redactEmail(value: string | null) {
  if (!value) {
    return null;
  }
  const [local, domain] = value.split("@");
  if (!domain) {
    return value;
  }
  const visible = local ? local[0] : "";
  return `${visible}***@${domain}`;
}

const auditHashFallbackSecret = randomBytes(32).toString("hex");

function getAuditHashSecret() {
  const configured = process.env.AUTH_SECRET?.trim();
  return configured || auditHashFallbackSecret;
}

function hashNetworkKey(value: string | undefined) {
  if (!value || value === "unknown") {
    return null;
  }
  return createHmac("sha256", getAuditHashSecret()).update(value).digest("hex");
}

function toJsonSafeValue(value: unknown, depth = 0): unknown {
  if (depth > 2) {
    return "[depth-limited]";
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => toJsonSafeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    return Object.fromEntries(entries.map(([key, item]) => [key, toJsonSafeValue(item, depth + 1)]));
  }
  return String(value);
}

function normalizeMetadata(input: Record<string, unknown> | undefined) {
  if (!input) {
    return {};
  }

  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries.map(([key, value]) => [key, toJsonSafeValue(value)]));
}

export async function recordSecurityAuditEvent(input: SecurityAuditEventInput) {
  const actorEmail = normalizeEmail(input.actorEmail);
  const targetEmail = normalizeEmail(input.targetEmail);
  const metadata = normalizeMetadata(input.metadata);
  const ipKeyHash = hashNetworkKey(input.networkFingerprint?.ipKey);
  const subnetKeyHash = hashNetworkKey(input.networkFingerprint?.subnetKey);
  const outcome = input.outcome.trim() || "unknown";

  console.info("[AUDIT]", {
    eventType: input.eventType,
    outcome,
    actor: redactEmail(actorEmail),
    target: redactEmail(targetEmail),
    metadata,
    hasIpHash: Boolean(ipKeyHash),
    hasSubnetHash: Boolean(subnetKeyHash),
  });

  if (!isDatabaseEnabled()) {
    return;
  }

  try {
    await dbQuery(
      `
        INSERT INTO security_audit_events (
          event_type,
          actor_email,
          target_email,
          ip_key_hash,
          subnet_key_hash,
          outcome,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        input.eventType,
        actorEmail,
        targetEmail,
        ipKeyHash,
        subnetKeyHash,
        outcome,
        JSON.stringify(metadata),
      ],
    );
  } catch (error) {
    console.warn("[AUDIT] Failed to persist security audit event", {
      eventType: input.eventType,
      outcome,
      reason: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

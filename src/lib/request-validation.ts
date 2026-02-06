interface ParseStringOptions {
  maxLength?: number;
  lowercase?: boolean;
  stripInnerWhitespace?: boolean;
}

interface ParseBoundedIntegerOptions {
  fallback: number;
  min: number;
  max: number;
}

interface ParseDelimitedListOptions {
  maxItems?: number;
  lowercase?: boolean;
}

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function parseString(value: unknown, options: ParseStringOptions = {}) {
  if (typeof value !== "string") {
    return "";
  }

  let normalized = options.stripInnerWhitespace ? value.replace(/\s+/g, "") : value.trim();
  if (options.lowercase) {
    normalized = normalized.toLowerCase();
  }
  if (typeof options.maxLength === "number" && options.maxLength >= 0) {
    normalized = normalized.slice(0, options.maxLength);
  }
  return normalized;
}

export function parseOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseBoolean(value: unknown) {
  return value === true;
}

export function parseEnum<T extends string>(value: unknown, allowed: readonly T[]) {
  if (typeof value !== "string") {
    return undefined;
  }
  return allowed.includes(value as T) ? (value as T) : undefined;
}

export function parseDelimitedList(value: unknown, options: ParseDelimitedListOptions = {}) {
  if (typeof value !== "string") {
    return [];
  }

  const items = value
    .split(/[\n,;]/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (options.lowercase ? entry.toLowerCase() : entry));
  const uniqueItems = [...new Set(items)];
  const maxItems = options.maxItems ?? uniqueItems.length;
  return uniqueItems.slice(0, maxItems);
}

export function parseBoundedInteger(value: string | null, options: ParseBoundedIntegerOptions) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return options.fallback;
  }
  return Math.max(options.min, Math.min(options.max, Math.floor(parsed)));
}

export function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

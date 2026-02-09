export const MAX_REVIEW_IMAGE_COUNT = 6;
export const MAX_LISTING_IMAGE_COUNT = 12;
export const MAX_IMAGE_UPLOAD_FILES = 6;
export const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_URL_LENGTH = 2048;

const ACCEPTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function normalizeImageUrlCandidate(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_IMAGE_URL_LENGTH) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseImageUrls(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return { ok: true as const, urls: [] };
  }

  if (value.length > maxItems) {
    return { ok: false as const, error: "too_many" as const };
  }

  const deduped = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") {
      return { ok: false as const, error: "invalid" as const };
    }
    const normalized = normalizeImageUrlCandidate(candidate);
    if (!normalized) {
      return { ok: false as const, error: "invalid" as const };
    }
    deduped.add(normalized);
  }

  return { ok: true as const, urls: Array.from(deduped) };
}

export function parseReviewImageUrls(value: unknown) {
  const parsed = parseImageUrls(value, MAX_REVIEW_IMAGE_COUNT);
  if (!parsed.ok) {
    return {
      ok: false as const,
      error:
        parsed.error === "too_many"
          ? `A review can include at most ${MAX_REVIEW_IMAGE_COUNT} images`
          : "Invalid review image URLs",
    };
  }

  return {
    ok: true as const,
    urls: parsed.urls,
  };
}

export function parseListingImageUrls(value: unknown) {
  const parsed = parseImageUrls(value, MAX_LISTING_IMAGE_COUNT);
  if (!parsed.ok) {
    return {
      ok: false as const,
      error:
        parsed.error === "too_many"
          ? `A listing can include at most ${MAX_LISTING_IMAGE_COUNT} images`
          : "Invalid listing image URLs",
    };
  }

  return {
    ok: true as const,
    urls: parsed.urls,
  };
}

export function isAcceptedImageMimeType(value: string) {
  return ACCEPTED_IMAGE_MIME_TYPES.has(value);
}

export function sanitizeImageFileName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  if (!normalized) {
    return "image";
  }

  return normalized.slice(0, 100);
}

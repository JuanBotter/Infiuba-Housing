import { randomUUID } from "node:crypto";

import { put } from "@vercel/blob";

import { canSubmitReviews, getRoleFromRequestAsync } from "@/lib/auth";
import { jsonNoStore, withNoStore } from "@/lib/http-cache";
import { validateSameOriginRequest } from "@/lib/request-origin";
import {
  isAcceptedImageMimeType,
  MAX_IMAGE_FILE_SIZE_BYTES,
  MAX_IMAGE_UPLOAD_FILES,
  sanitizeImageFileName,
} from "@/lib/review-images";

export const runtime = "nodejs";

function resolveBlobUploadPrefix() {
  const raw = process.env.BLOB_UPLOAD_PREFIX;
  if (typeof raw !== "string") {
    return "";
  }

  const normalized = raw
    .trim()
    .split("/")
    .map((segment) =>
      segment
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("/");

  return normalized;
}

function parseUploadFiles(formData: FormData) {
  const all = formData.getAll("files");
  const files: File[] = [];

  for (const entry of all) {
    if (!(entry instanceof File)) {
      continue;
    }
    if (!entry.size) {
      continue;
    }
    files.push(entry);
  }

  return files;
}

export async function POST(request: Request) {
  const originValidation = validateSameOriginRequest(request);
  if (!originValidation.ok) {
    return withNoStore(originValidation.response);
  }

  const role = await getRoleFromRequestAsync(request);
  if (!canSubmitReviews(role)) {
    return jsonNoStore(
      { error: "Only whitelisted students can upload images." },
      { status: 403 },
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return jsonNoStore({ error: "Invalid upload payload" }, { status: 400 });
  }

  const files = parseUploadFiles(formData);
  if (files.length === 0) {
    return jsonNoStore({ error: "No images provided" }, { status: 400 });
  }
  if (files.length > MAX_IMAGE_UPLOAD_FILES) {
    return jsonNoStore(
      { error: `You can upload at most ${MAX_IMAGE_UPLOAD_FILES} images at a time` },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (!isAcceptedImageMimeType(file.type)) {
      return jsonNoStore(
        {
          error:
            "Unsupported image format. Allowed formats: JPG, PNG, WebP, GIF, AVIF.",
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      return jsonNoStore(
        {
          error: `Each image must be ${Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB or less`,
        },
        { status: 400 },
      );
    }
  }

  try {
    const uploadPrefix = resolveBlobUploadPrefix();
    const storageRoot = uploadPrefix ? `${uploadPrefix}/reviews` : "reviews";

    const uploaded = await Promise.all(
      files.map(async (file) => {
        const safeName = sanitizeImageFileName(file.name);
        const pathname = `${storageRoot}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
        const result = await put(pathname, file, {
          access: "public",
          addRandomSuffix: false,
          contentType: file.type,
        });

        return result.url;
      }),
    );

    return jsonNoStore({ ok: true, urls: uploaded }, { status: 201 });
  } catch (error) {
    console.warn("[REVIEW_IMAGES] upload failed", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonNoStore(
      { error: "Image upload is unavailable. Try again later." },
      { status: 503 },
    );
  }
}

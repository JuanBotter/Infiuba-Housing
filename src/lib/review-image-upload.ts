import { MAX_IMAGE_FILE_SIZE_BYTES } from "@/lib/review-images";

const JPEG_QUALITIES = [0.82, 0.75, 0.68, 0.6, 0.52] as const;
const MAX_DIMENSIONS = [1920, 1600, 1280, 1024] as const;
const OPTIMIZE_MIN_FILE_SIZE_BYTES = 1 * 1024 * 1024; // ~1MB

function isBrowserImageCompressionAvailable() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function buildFileTooLargeError() {
  return `Each image must be ${Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB or less`;
}

function replaceExtension(filename: string, nextExtension: string) {
  const trimmed = filename.trim();
  if (!trimmed) {
    return `image${nextExtension}`;
  }

  const withoutExtension = trimmed.replace(/\.[^/.]+$/, "");
  if (!withoutExtension || withoutExtension === trimmed) {
    return `${trimmed}${nextExtension}`;
  }

  return `${withoutExtension}${nextExtension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function loadImageFromObjectUrl(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  try {
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image load failed"));
      });
    }
  } catch {
    return null;
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    return null;
  }

  return { image, width, height };
}

async function compressImageFileToJpeg(file: File) {
  const requiresUnderLimit = file.size > MAX_IMAGE_FILE_SIZE_BYTES;
  const shouldOptimize = !requiresUnderLimit && file.size > OPTIMIZE_MIN_FILE_SIZE_BYTES;
  if (!requiresUnderLimit && !shouldOptimize) {
    return { ok: true as const, file };
  }
  if (!isBrowserImageCompressionAvailable()) {
    if (requiresUnderLimit) {
      return { ok: false as const, error: buildFileTooLargeError() };
    }
    return { ok: true as const, file };
  }
  if (file.type === "image/gif") {
    if (requiresUnderLimit) {
      return { ok: false as const, error: buildFileTooLargeError() };
    }
    return { ok: true as const, file };
  }

  const url = URL.createObjectURL(file);
  try {
    const loaded = await loadImageFromObjectUrl(url);
    if (!loaded) {
      if (requiresUnderLimit) {
        return { ok: false as const, error: buildFileTooLargeError() };
      }
      return { ok: true as const, file };
    }

    const baselineSize = file.size;
    const optimizeMaxSizeBytes = shouldOptimize ? Math.floor(baselineSize * 0.95) : baselineSize;

    for (const maxDimension of MAX_DIMENSIONS) {
      const scale = Math.min(1, maxDimension / Math.max(loaded.width, loaded.height));
      const targetWidth = Math.max(1, Math.round(loaded.width * scale));
      const targetHeight = Math.max(1, Math.round(loaded.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        continue;
      }

      // Flatten transparency to white so PNG alpha doesn't become black when encoding JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(loaded.image, 0, 0, targetWidth, targetHeight);

      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);
        if (!blob) {
          continue;
        }
        if (blob.size > MAX_IMAGE_FILE_SIZE_BYTES) {
          continue;
        }

        if (shouldOptimize && blob.size >= optimizeMaxSizeBytes) {
          continue;
        }

        if (requiresUnderLimit || shouldOptimize) {
          return {
            ok: true as const,
            file: new File([blob], replaceExtension(file.name, ".jpg"), {
              type: blob.type,
              lastModified: file.lastModified,
            }),
          };
        }
      }
    }

    if (requiresUnderLimit) {
      return { ok: false as const, error: buildFileTooLargeError() };
    }

    return { ok: true as const, file };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadReviewImageFiles(files: File[]) {
  const prepared: File[] = [];
  for (const file of files) {
    const result = await compressImageFileToJpeg(file);
    if (!result.ok) {
      return result;
    }
    prepared.push(result.file);
  }

  const formData = new FormData();
  for (const file of prepared) {
    formData.append("files", file);
  }

  const response = await fetch("/api/review-images", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const error = typeof payload?.error === "string" ? payload.error : "Image upload failed";
    return {
      ok: false as const,
      error,
    };
  }

  const payload = (await response.json().catch(() => null)) as { urls?: unknown } | null;
  const urls = Array.isArray(payload?.urls)
    ? payload.urls.filter((item): item is string => typeof item === "string")
    : [];

  return {
    ok: true as const,
    urls,
  };
}

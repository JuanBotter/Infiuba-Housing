export async function uploadReviewImageFiles(files: File[]) {
  const formData = new FormData();
  for (const file of files) {
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

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  canSubmitReviews: vi.fn(),
  getRoleFromRequestAsync: vi.fn(),
}));

vi.mock("@/lib/request-origin", () => ({
  validateSameOriginRequest: vi.fn(() => ({ ok: true })),
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}));

let POST: typeof import("@/app/api/review-images/route").POST;
let mockedAuth: typeof import("@/lib/auth");
let mockedOrigin: typeof import("@/lib/request-origin");
let mockedBlob: typeof import("@vercel/blob");

beforeAll(async () => {
  POST = (await import("@/app/api/review-images/route")).POST;
  mockedAuth = vi.mocked(await import("@/lib/auth"));
  mockedOrigin = vi.mocked(await import("@/lib/request-origin"));
  mockedBlob = vi.mocked(await import("@vercel/blob"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedOrigin.validateSameOriginRequest.mockReturnValue({ ok: true });
  mockedAuth.getRoleFromRequestAsync.mockResolvedValue("whitelisted");
  mockedAuth.canSubmitReviews.mockReturnValue(true);
});

function buildUploadRequest(files: File[]) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  return new Request("http://localhost/api/review-images", {
    method: "POST",
    body: formData,
  });
}

describe("/api/review-images", () => {
  it("rejects unauthorized uploads", async () => {
    mockedAuth.canSubmitReviews.mockReturnValueOnce(false);

    const response = await POST(
      buildUploadRequest([new File(["content"], "photo.jpg", { type: "image/jpeg" })]),
    );

    expect(response.status).toBe(403);
  });

  it("rejects unsupported MIME types", async () => {
    const response = await POST(
      buildUploadRequest([new File(["content"], "notes.txt", { type: "text/plain" })]),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Unsupported image format"),
    });
  });

  it("rejects more than six files per upload", async () => {
    const files = Array.from({ length: 7 }, (_, index) =>
      new File([`photo-${index}`], `photo-${index}.png`, { type: "image/png" }),
    );

    const response = await POST(buildUploadRequest(files));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("at most"),
    });
  });

  it("uploads files and returns public URLs", async () => {
    mockedBlob.put.mockResolvedValueOnce({
      url: "https://example-blob.vercel-storage.com/reviews/img-1.jpg",
    } as never);
    mockedBlob.put.mockResolvedValueOnce({
      url: "https://example-blob.vercel-storage.com/reviews/img-2.jpg",
    } as never);

    const response = await POST(
      buildUploadRequest([
        new File(["one"], "first.jpg", { type: "image/jpeg" }),
        new File(["two"], "second.png", { type: "image/png" }),
      ]),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      urls: [
        "https://example-blob.vercel-storage.com/reviews/img-1.jpg",
        "https://example-blob.vercel-storage.com/reviews/img-2.jpg",
      ],
    });
    expect(mockedBlob.put).toHaveBeenCalledTimes(2);
  });
});

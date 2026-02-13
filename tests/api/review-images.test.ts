import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  canUploadReviewImages: vi.fn(),
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
const previousBlobUploadPrefix = process.env.BLOB_UPLOAD_PREFIX;

beforeAll(async () => {
  POST = (await import("@/app/api/review-images/route")).POST;
  mockedAuth = vi.mocked(await import("@/lib/auth"));
  mockedOrigin = vi.mocked(await import("@/lib/request-origin"));
  mockedBlob = vi.mocked(await import("@vercel/blob"));
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BLOB_UPLOAD_PREFIX;
  mockedOrigin.validateSameOriginRequest.mockReturnValue({ ok: true });
  mockedAuth.getRoleFromRequestAsync.mockResolvedValue("whitelisted");
  mockedAuth.canUploadReviewImages.mockReturnValue(true);
});

afterAll(() => {
  if (previousBlobUploadPrefix === undefined) {
    delete process.env.BLOB_UPLOAD_PREFIX;
    return;
  }
  process.env.BLOB_UPLOAD_PREFIX = previousBlobUploadPrefix;
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
    mockedAuth.canUploadReviewImages.mockReturnValueOnce(false);

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
    expect(mockedBlob.put).toHaveBeenCalledWith(
      expect.stringMatching(/^reviews\/\d{4}-\d{2}-\d{2}\//),
      expect.any(File),
      expect.any(Object),
    );
  });

  it("applies BLOB_UPLOAD_PREFIX to uploaded file paths", async () => {
    process.env.BLOB_UPLOAD_PREFIX = "/Preview Stage//Infiuba/";
    mockedBlob.put.mockResolvedValueOnce({
      url: "https://example-blob.vercel-storage.com/reviews/img-prefixed.jpg",
    } as never);

    const response = await POST(
      buildUploadRequest([new File(["one"], "first.jpg", { type: "image/jpeg" })]),
    );

    expect(response.status).toBe(201);
    expect(mockedBlob.put).toHaveBeenCalledWith(
      expect.stringMatching(/^preview-stage\/infiuba\/reviews\/\d{4}-\d{2}-\d{2}\//),
      expect.any(File),
      expect.any(Object),
    );
  });
});

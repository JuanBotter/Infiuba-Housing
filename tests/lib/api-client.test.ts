import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  apiGetJson,
  apiPostJson,
  apiRequestJson,
  getApiClientErrorPayload,
  isApiClientError,
  mapApiClientErrorMessage,
} from "@/lib/api-client";

describe("api-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reads JSON payloads for successful GET requests", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, value: 42 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(apiGetJson<{ ok: boolean; value: number }>("/api/test")).resolves.toEqual({
      ok: true,
      value: 42,
    });
    expect(fetchSpy).toHaveBeenCalledWith("/api/test", undefined);
  });

  it("sends JSON body for POST requests", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await apiPostJson<{ ok: boolean }>("/api/test", { action: "ping" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "ping" }),
      }),
    );
  });

  it("throws typed ApiClientError on non-ok responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "request_origin_invalid",
          message: "Invalid request origin",
          error: "Invalid request origin",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(apiRequestJson("/api/test")).rejects.toMatchObject({
      name: "ApiClientError",
      status: 403,
      code: "request_origin_invalid",
      serverMessage: "Invalid request origin",
    });
  });

  it("maps API client errors by code first, then status, then fallback", () => {
    const error = new ApiClientError({
      status: 401,
      code: "auth_not_allowed",
      serverMessage: "Not allowed",
      payload: { code: "auth_not_allowed", message: "Not allowed" },
    });

    expect(
      mapApiClientErrorMessage(error, {
        defaultMessage: "default",
        codeMessages: { auth_not_allowed: "code-message" },
        statusMessages: { 401: "status-message" },
      }),
    ).toBe("code-message");

    const statusOnlyError = new ApiClientError({
      status: 503,
      code: "",
      serverMessage: "Unavailable",
      payload: { message: "Unavailable" },
    });
    expect(
      mapApiClientErrorMessage(statusOnlyError, {
        defaultMessage: "default",
        statusMessages: { 503: "status-message" },
      }),
    ).toBe("status-message");

    const unknownError = new Error("network");
    expect(
      mapApiClientErrorMessage(unknownError, {
        defaultMessage: "default",
      }),
    ).toBe("default");
  });

  it("exposes payload and type guard helpers", () => {
    const error = new ApiClientError({
      status: 400,
      code: "invalid_payload",
      serverMessage: "Invalid payload",
      payload: { invalidEmails: ["bad@example"] },
    });

    expect(isApiClientError(error)).toBe(true);
    expect(getApiClientErrorPayload(error)).toEqual({ invalidEmails: ["bad@example"] });
    expect(getApiClientErrorPayload(new Error("oops"))).toBeNull();
  });
});

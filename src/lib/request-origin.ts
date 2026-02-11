import { NextResponse } from "next/server";

function tryParseOrigin(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export const REQUEST_ORIGIN_ERROR_CODES = {
  VALIDATION_FAILED: "request_origin_validation_failed",
  INVALID: "request_origin_invalid",
  MISSING: "request_origin_missing",
} as const;

type RequestOriginErrorCode =
  (typeof REQUEST_ORIGIN_ERROR_CODES)[keyof typeof REQUEST_ORIGIN_ERROR_CODES];

function buildOriginErrorResponse(
  code: RequestOriginErrorCode,
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      code,
      message,
      // Compatibility alias for legacy clients still reading `error`.
      error: message,
    },
    { status },
  );
}

export function validateSameOriginRequest(request: Request) {
  const expectedOrigin = tryParseOrigin(request.url);
  if (!expectedOrigin) {
    return {
      ok: false as const,
      response: buildOriginErrorResponse(
        REQUEST_ORIGIN_ERROR_CODES.VALIDATION_FAILED,
        "Could not validate request origin",
        400,
      ),
    };
  }

  const originHeader = tryParseOrigin(request.headers.get("origin"));
  if (originHeader) {
    if (originHeader === expectedOrigin) {
      return { ok: true as const };
    }

    return {
      ok: false as const,
      response: buildOriginErrorResponse(
        REQUEST_ORIGIN_ERROR_CODES.INVALID,
        "Invalid request origin",
        403,
      ),
    };
  }

  const referer = request.headers.get("referer");
  const refererOrigin = tryParseOrigin(referer);
  if (refererOrigin && refererOrigin === expectedOrigin) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    response: buildOriginErrorResponse(
      REQUEST_ORIGIN_ERROR_CODES.MISSING,
      "Missing request origin",
      403,
    ),
  };
}

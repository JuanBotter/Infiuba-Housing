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

export function validateSameOriginRequest(request: Request) {
  const expectedOrigin = tryParseOrigin(request.url);
  if (!expectedOrigin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Could not validate request origin" }, { status: 400 }),
    };
  }

  const originHeader = tryParseOrigin(request.headers.get("origin"));
  if (originHeader) {
    if (originHeader === expectedOrigin) {
      return { ok: true as const };
    }

    return {
      ok: false as const,
      response: NextResponse.json({ error: "Invalid request origin" }, { status: 403 }),
    };
  }

  const referer = request.headers.get("referer");
  const refererOrigin = tryParseOrigin(referer);
  if (refererOrigin && refererOrigin === expectedOrigin) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    response: NextResponse.json({ error: "Missing request origin" }, { status: 403 }),
  };
}

import { NextResponse } from "next/server";

import { canAccessAdmin, getAuthSessionFromRequest, type AuthSession } from "@/lib/auth";
import { isDatabaseEnabled } from "@/lib/db";
import { jsonNoStore, withNoStore } from "@/lib/http-cache";
import { validateSameOriginRequest } from "@/lib/request-origin";

interface JsonErrorOptions {
  status?: number;
  noStore?: boolean;
}

interface RequireDbOptions {
  errorMessage?: string;
  status?: number;
  noStore?: boolean;
}

interface RequireAdminSessionOptions {
  errorMessage?: string;
  status?: number;
  noStore?: boolean;
}

type RequireAdminSessionResult =
  | {
      ok: true;
      session: AuthSession;
    }
  | {
      ok: false;
      response: Response;
    };

export function jsonError(message: string, options: JsonErrorOptions = {}) {
  const status = options.status ?? 400;
  if (options.noStore) {
    return jsonNoStore({ error: message }, { status });
  }
  return NextResponse.json({ error: message }, { status });
}

export function requireSameOrigin(request: Request, options: { noStore?: boolean } = {}) {
  const originValidation = validateSameOriginRequest(request);
  if (originValidation.ok) {
    return null;
  }
  if (options.noStore) {
    return withNoStore(originValidation.response);
  }
  return originValidation.response;
}

export function requireDb(options: RequireDbOptions = {}) {
  if (isDatabaseEnabled()) {
    return null;
  }
  return jsonError(options.errorMessage ?? "Database is required", {
    status: options.status ?? 503,
    noStore: options.noStore,
  });
}

export async function requireAdminSession(
  request: Request,
  options: RequireAdminSessionOptions = {},
): Promise<RequireAdminSessionResult> {
  const session = await getAuthSessionFromRequest(request);
  if (canAccessAdmin(session.role)) {
    return { ok: true, session };
  }
  return {
    ok: false,
    response: jsonError(options.errorMessage ?? "Unauthorized", {
      status: options.status ?? 401,
      noStore: options.noStore ?? true,
    }),
  };
}

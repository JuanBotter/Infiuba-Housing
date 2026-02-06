import { NextResponse } from "next/server";

const NO_STORE_CACHE_CONTROL = "no-store, max-age=0";

export function withNoStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", NO_STORE_CACHE_CONTROL);
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  return withNoStore(NextResponse.json(body, init));
}

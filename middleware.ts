import { NextResponse, type NextRequest } from "next/server";

const CSP_IMG_SRC =
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.public.blob.vercel-storage.com";

function createNonce() {
  return btoa(crypto.randomUUID()).replace(/=+$/g, "");
}

function isHtmlDocumentRequest(request: NextRequest) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

export function buildContentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'none'",
    CSP_IMG_SRC,
    "font-src 'self' data:",
    "connect-src 'self'",
    "report-uri /api/security/csp-report",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" || !isHtmlDocumentRequest(request)) {
    return NextResponse.next();
  }

  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("x-nonce", nonce);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};

import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers for every page, with a fresh nonce per request so that the
 * only scripts that can run are this site's own and Stripe's card form.
 *
 * - Scripts: only those carrying this request's nonce, and what they load (Stripe.js).
 * - Connections: this site, this shop's API (HTTPS and its live WebSocket), and Stripe.
 * - Frames: Stripe's card form only. Nobody may frame this site.
 * - No referrer is sent, so an order's private link never leaks to another site.
 */
function apiOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_DAN_API_URL?.trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${ws}//${url.host}`];
  } catch {
    return [];
  }
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.stripe.com",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigins().join(" ")} https://api.stripe.com https://*.stripe.com${dev ? " ws:" : ""}`,
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")');
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

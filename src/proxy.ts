import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers for every page, with a fresh nonce per request so that the
 * only scripts that can run are this site's own and Stripe's card form.
 *
 * - Scripts: only those carrying this request's nonce, and what they load (Stripe.js).
 * - Connections: this site, this shop's API (HTTPS and its live WebSocket), and Stripe.
 *   On the shop's machine the API shares this site's address, so that is its
 *   own address and its WebSocket.
 * - Frames: Stripe's card form only. Nobody may frame this site.
 * - No referrer is sent, so an order's private link never leaks to another site.
 */
/** The address the visitor used, as the shop's web front passes it on. Only a plain host[:port] is accepted, so nothing can be slipped into the policy. */
export function visitedAddress(headers: Headers, fallbackProtocol: string): { secure: boolean; host: string | null } {
  const first = (value: string | null) => value?.split(",")[0]?.trim().toLowerCase() ?? "";
  const host = first(headers.get("x-forwarded-host")) || first(headers.get("host"));
  const protocol = first(headers.get("x-forwarded-proto")) || fallbackProtocol.replace(/:$/, "");
  return {
    secure: protocol === "https",
    host: /^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(host) ? host : null,
  };
}

export function apiOrigins(configured: string | undefined, visited: { secure: boolean; host: string | null }): string[] {
  const raw = configured?.trim();
  if (!raw) {
    // Same address as this site: 'self' covers the HTTPS calls; name the WebSocket too, for older browsers.
    return visited.host ? [`${visited.secure ? "wss:" : "ws:"}//${visited.host}`] : [];
  }
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
  const visited = visitedAddress(request.headers, request.nextUrl.protocol);
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.stripe.com",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigins(process.env.NEXT_PUBLIC_DAN_API_URL, visited).join(" ")} https://api.stripe.com https://*.stripe.com${dev ? " ws:" : ""}`,
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only when the visitor came over HTTPS: on the shop's own network the site may be opened over plain HTTP to test it.
    ...(!dev && visited.secure ? ["upgrade-insecure-requests"] : []),
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

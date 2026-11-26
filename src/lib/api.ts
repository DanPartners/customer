import { normalizeTheme } from "./theme";
import type { Menu, PlaceOrderInput, PublicOrder, Shop } from "./types";

/**
 * The shop's public API. Each copy of this site belongs to one shop.
 *
 * Usually the site runs on the shop's own machine, behind the same address as
 * the API (the shop server's web front sends /graphql to the API and the rest
 * here), so the API is simply this site's own address. A copy hosted somewhere
 * else is built with the shop's API address in NEXT_PUBLIC_DAN_API_URL.
 *
 * This site is open source and holds no secrets: the shop server decides every
 * price and refuses requests from sites it has not approved.
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiBase(
  configured: string | undefined = process.env.NEXT_PUBLIC_DAN_API_URL,
  here: string | undefined = typeof window === "undefined" ? undefined : window.location.origin,
): string | null {
  const raw = (configured?.trim() || here || "").replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin + url.pathname.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

type Body<T> = { data?: T | null; errors?: { message?: string; extensions?: { code?: unknown } }[] };

export async function call<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: { fetchImpl?: typeof fetch; base?: string | null } = {},
): Promise<T> {
  const base = options.base === undefined ? apiBase() : options.base;
  if (!base) throw new ApiError("not_configured", "This site is not connected to a shop yet.");
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${base}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ApiError("unreachable", "The shop could not be reached.");
  }
  let body: Body<T> | null = null;
  try {
    body = (await response.json()) as Body<T>;
  } catch {
    body = null;
  }
  const error = body?.errors?.[0];
  if (error) {
    const code = typeof error.extensions?.code === "string" ? error.extensions.code : "error";
    throw new ApiError(code, error.message ?? "The shop could not do that.");
  }
  if (!response.ok || !body?.data) throw new ApiError("error", "The shop could not do that.");
  return body.data;
}

const THEME = "preset typeface custom { paper ink accent chrome }";
export const ORDER =
  "number status createdAt customerName notes fulfilment table address deliveryFeePence deliveryBy totalPence clientSecret payBy payment { method status } bankTransfer { accountName sortCode accountNumber reference amountPence } lines { number nameEn nameZh qty unitPricePence }";

export async function loadShop(options?: { fetchImpl?: typeof fetch; base?: string | null }): Promise<{ shop: Shop; menu: Menu }> {
  const data = await call<{ shop: Shop; menu: Menu }>(
    `query Shop {
      shop { name nameZh address city phone theme { ${THEME} } payments { card atShop } ordering { acceptingOrders table collection delivery deliveryFeePence deliveryMinimumPence payInPerson cashOnDelivery card bankTransfer } stripePublishableKey stripeAccount }
      menu {
        categories { id nameEn nameZh sort }
        items { id number categoryId nameEn nameZh descriptionEn pricePence allergens soldOut kind includes { number qty } photo }
      }
    }`,
    {},
    options,
  );
  return { shop: { ...data.shop, theme: normalizeTheme(data.shop.theme) }, menu: data.menu };
}

export async function placeOrder(input: PlaceOrderInput, options?: { fetchImpl?: typeof fetch; base?: string | null }) {
  const data = await call<{ placeOrder: { token: string; order: PublicOrder } }>(
    `mutation Place($input: PlaceOrderInput!) { placeOrder(input: $input) { token order { ${ORDER} } } }`,
    { input },
    options,
  );
  return data.placeOrder;
}

export async function loadOrder(token: string, options?: { fetchImpl?: typeof fetch; base?: string | null }): Promise<PublicOrder> {
  const data = await call<{ order: PublicOrder }>(`query Order($token: String!) { order(token: $token) { ${ORDER} } }`, { token }, options);
  return data.order;
}

/** A private link's code is 32 hex characters. Anything else is not looked up. */
export function isToken(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value);
}

/** A dish photo's address: served by the Dan cloud at the shop's API address. Null for anything but a photo path. */
export function photoUrl(photo: string | null | undefined, size: "thumb" | "large", base: string | null = apiBase()): string | null {
  if (!photo || !base || !/^images\/[0-9a-f]{64}$/.test(photo)) return null;
  return `${base}/${photo}/${size}.jpg`;
}

import { normalizeTheme } from "./theme";
import type { DeliveryQuote, Menu, OrderLineInput, PlaceOrderInput, PublicOrder, Quote, Shop } from "./types";

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
const APPLIED = "id nameEn nameZh kind value amountPence";
/** What every shop server knows of an order. */
const ORDER_PLAIN =
  "number status createdAt customerName notes fulfilment table address deliveryFeePence deliveryBy totalPence clientSecret payBy payment { method status } bankTransfer { accountName sortCode accountNumber reference amountPence } lines { number nameEn nameZh qty unitPricePence } courier { status trackingUrl dropoffEta } refund";
/** With what was chosen for each dish and the add-ons on the bill. */
const ORDER_PRICED = `${ORDER_PLAIN.replace("lines { number nameEn nameZh qty unitPricePence }", `lines { number nameEn nameZh qty unitPricePence totalPence options { nameEn nameZh pricePence } addons { ${APPLIED} } }`)} addons { ${APPLIED} }`;

/**
 * Whether the shop server knows dish options and add-ons. It does when it is
 * the version this site was built for (they are deployed together); a copy of
 * this site pointed at an older shop server finds out when it loads the shop.
 */
let priced = true;

/** The order fields to ask for, for queries and the live channel alike. */
export const orderFields = () => (priced ? ORDER_PRICED : ORDER_PLAIN);

const SHOP_FIELDS = `name nameZh address city phone theme { ${THEME} } payments { card atShop } ordering { acceptingOrders table collection delivery deliveryFeePence deliveryMinimumPence payInPerson cashOnDelivery card bankTransfer deliveryQuoted deliveryFreeOverPence } stripePublishableKey stripeAccount`;
const ITEM_PLAIN = "id number categoryId nameEn nameZh descriptionEn pricePence allergens soldOut kind includes { number qty } photo";

export async function loadShop(options?: { fetchImpl?: typeof fetch; base?: string | null }): Promise<{ shop: Shop; menu: Menu }> {
  const ask = (withOptions: boolean) =>
    call<{ shop: Shop; menu: Omit<Menu, "addons">; addons?: Menu["addons"] }>(
      `query Shop {
      shop { ${SHOP_FIELDS} }
      menu {
        categories { id nameEn nameZh sort }
        items { ${ITEM_PLAIN}${withOptions ? " options { id nameEn nameZh kind choices { id nameEn nameZh pricePence allergens } }" : ""} }
      }${withOptions ? "\n      addons { id nameEn nameZh scope kind value auto required }" : ""}
    }`,
      {},
      options,
    );
  let data;
  try {
    data = await ask(true);
    priced = true;
  } catch (error) {
    // A shop server from before options and add-ons does not know those fields: the menu without them.
    if (!(error instanceof ApiError) || error.code !== "error") throw error;
    data = await ask(false);
    priced = false;
  }
  return { shop: { ...data.shop, theme: normalizeTheme(data.shop.theme) }, menu: { ...data.menu, addons: data.addons ?? [] } };
}

/**
 * What a basket comes to, worked out by the shop: each line, the add-ons on
 * the bill, and the total before any delivery fee. `addons`: the bill
 * add-ons ticked; left out, the ones ticked to begin with.
 */
export async function quote(input: { lines: OrderLineInput[]; addons?: string[] }, options?: { fetchImpl?: typeof fetch; base?: string | null }): Promise<Quote> {
  const data = await call<{ quote: Quote }>(
    `query Quote($input: QuoteInput!) { quote(input: $input) { totalPence addons { ${APPLIED} } lines { number nameEn nameZh qty unitPricePence totalPence options { choiceId nameEn nameZh pricePence } addons { ${APPLIED} } } } }`,
    { input },
    options,
  );
  return data.quote;
}

export async function placeOrder(input: PlaceOrderInput, options?: { fetchImpl?: typeof fetch; base?: string | null }) {
  const data = await call<{ placeOrder: { token: string; order: PublicOrder } }>(
    `mutation Place($input: PlaceOrderInput!) { placeOrder(input: $input) { token order { ${orderFields()} } } }`,
    { input },
    options,
  );
  return data.placeOrder;
}

/** What an Uber courier to this address costs now. Held for 20 minutes; pass its token with the order. */
export async function deliveryQuote(
  input: { address: string; postcode: string; phone: string; lines: OrderLineInput[]; addons?: string[] },
  options?: { fetchImpl?: typeof fetch; base?: string | null },
): Promise<DeliveryQuote> {
  const data = await call<{ deliveryQuote: DeliveryQuote }>(
    "mutation Quote($input: DeliveryQuoteInput!) { deliveryQuote(input: $input) { token feePence expiresAt } }",
    { input },
    options,
  );
  return data.deliveryQuote;
}

export async function loadOrder(token: string, options?: { fetchImpl?: typeof fetch; base?: string | null }): Promise<PublicOrder> {
  const data = await call<{ order: PublicOrder }>(`query Order($token: String!) { order(token: $token) { ${orderFields()} } }`, { token }, options);
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

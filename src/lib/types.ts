/**
 * What the shop server's public API returns. The contract is `public.graphql`
 * in the shop server's repository; these types ask for exactly those fields.
 */
import type { ThemeChoice } from "./theme";

export const ALLERGENS = [
  "celery",
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "lupin",
  "milk",
  "molluscs",
  "mustard",
  "nuts",
  "peanuts",
  "sesame",
  "soya",
  "sulphites",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export type Shop = {
  name: string;
  nameZh: string;
  address: string;
  city: string;
  phone: string;
  theme: ThemeChoice;
  payments: { card: boolean; atShop: boolean };
  /** How the shop takes orders and payment online. Missing from older shop servers. */
  ordering?: Ordering | null;
  stripePublishableKey: string | null;
  /** With Stripe Connect, the shop's own Stripe account. */
  stripeAccount?: string | null;
};

/** What the owner switched on, and could work. */
export type Ordering = {
  acceptingOrders: boolean;
  table: boolean;
  collection: boolean;
  delivery: boolean;
  deliveryFeePence: number | null;
  deliveryMinimumPence: number | null;
  payInPerson: boolean;
  cashOnDelivery: boolean;
  card: boolean;
  bankTransfer: boolean;
  /** Delivery by an Uber courier, priced per address (ask for a quote). */
  deliveryQuoted?: boolean;
  /** Free delivery for food at or over this, when quoted. */
  deliveryFreeOverPence?: number | null;
};

export type Category = { id: string; nameEn: string; nameZh: string; sort: number };

/** One choice in a group of a dish's options. */
export type OptionChoice = {
  /** Its own within the dish. An order names choices by it. */
  id: string;
  nameEn: string;
  nameZh: string;
  /** What it adds to the dish's price, in pence. A minus takes off; 0 changes nothing. */
  pricePence: number;
  /** Allergens this choice brings that the dish itself may not have. */
  allergens: Allergen[];
};

/** A group of a dish's options: "Size", "Extras". `one`: exactly one is taken; `any`: any number. */
export type OptionGroup = { id: string; nameEn: string; nameZh: string; kind: "one" | "any"; choices: OptionChoice[] };

/**
 * One of the shop's add-ons for online orders: a named amount for the whole
 * bill or for one dish, plus or minus (a service charge, a bag, an offer).
 */
export type Addon = {
  id: string;
  nameEn: string;
  nameZh: string;
  scope: "bill" | "dish";
  kind: "fixed" | "percent";
  /** Pence for a fixed amount; hundredths of a percent for a percentage (1000 is 10%). A minus takes off. */
  value: number;
  /** Ticked to begin with. */
  auto: boolean;
  /** Always applied: it cannot be taken off. */
  required: boolean;
};

/** An add-on as the shop applied it, with what it came to. */
export type AppliedAddon = { id: string; nameEn: string; nameZh: string; kind: "fixed" | "percent"; value: number; amountPence: number };

/** One line of an order as the shop priced it. */
export type PricedLine = {
  number: number;
  nameEn: string;
  nameZh: string;
  qty: number;
  /** One of the dish, with the options chosen. */
  unitPricePence: number;
  options?: { choiceId?: string; nameEn: string; nameZh: string; pricePence: number }[];
  addons?: AppliedAddon[];
  /** What the line comes to: the dishes and its add-ons. Missing from older shop servers. */
  totalPence?: number;
};

/** What a basket comes to, worked out by the shop: before any delivery fee. */
export type Quote = { lines: PricedLine[]; addons: AppliedAddon[]; totalPence: number };

/** A dish as an order asks for it: how many, and how it is taken. */
export type OrderLineInput = { number: number; qty: number; options?: string[]; addons?: string[] };

export type MenuItem = {
  id: string;
  number: number;
  categoryId: string;
  nameEn: string;
  nameZh: string;
  descriptionEn: string;
  pricePence: number;
  allergens: Allergen[];
  soldOut: boolean;
  kind: "item" | "set";
  includes: { number: number; qty: number }[];
  /** The dish's photo, `images/<hash>`, served at the shop's address. None without one. */
  photo?: string | null;
  /** The dish's options, in the order they are asked. Missing or empty for most dishes. */
  options?: OptionGroup[];
};

export type Menu = { categories: Category[]; items: MenuItem[]; /** The shop's add-ons for online orders. Empty for most shops. */ addons: Addon[] };

export type PayWith = "card" | "at_shop" | "bank_transfer";

export type OrderStatus = "awaiting_payment" | "new" | "preparing" | "ready" | "completed" | "expired" | "rejected" | "cancelled";

export type PublicOrder = {
  number: number | null;
  status: OrderStatus;
  createdAt: string;
  customerName: string;
  notes: string;
  fulfilment: "collection" | "eat_in" | "delivery";
  table: string | null;
  address?: string;
  deliveryFeePence?: number | null;
  deliveryBy?: "shop" | "uber_direct" | null;
  /** How to pay an unpaid bank-transfer order. */
  bankTransfer?: { accountName: string; sortCode: string; accountNumber: string; reference: string; amountPence: number } | null;
  lines: PricedLine[];
  /** The add-ons on the bill, with what each came to. Already in the total. */
  addons?: AppliedAddon[];
  totalPence: number;
  payment: { method: PayWith; status: "due" | "paid" };
  clientSecret: string | null;
  payBy: string | null;
  /** The Uber courier bringing it, once booked. */
  courier?: { status: string; trackingUrl: string; dropoffEta: string } | null;
  /** A cancelled card order: "refunded", or "failed" (the shop refunds it). */
  refund?: string | null;
};

/** What an Uber courier to one address costs, held for a while. */
export type DeliveryQuote = { token: string; feePence: number; expiresAt: string };

export type PlaceOrderInput = {
  customerName: string;
  phone: string;
  notes: string;
  lines: OrderLineInput[];
  /** The bill add-ons ticked. Left out: the ones ticked to begin with. Required ones apply either way. */
  addons?: string[];
  payWith: PayWith;
  allergensConfirmed: boolean;
  /** Set when ordering from a table's link: the order is brought to it. */
  table: string | null;
  /** Without a table: collection (the default) or delivery, with the address. */
  fulfilment?: "collection" | "delivery";
  address?: string;
  postcode?: string;
  /** For a delivery priced per address: the quote's token. */
  deliveryQuote?: string;
};

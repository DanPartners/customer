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
};

export type Menu = { categories: Category[]; items: MenuItem[] };

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
  lines: { number: number; nameEn: string; nameZh: string; qty: number; unitPricePence: number }[];
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
  lines: { number: number; qty: number }[];
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

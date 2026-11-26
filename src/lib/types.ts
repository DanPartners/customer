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
  stripePublishableKey: string | null;
  /** With Stripe Connect, the shop's own Stripe account. */
  stripeAccount?: string | null;
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

export type PayWith = "card" | "at_shop";

export type OrderStatus = "awaiting_payment" | "new" | "preparing" | "ready" | "completed" | "expired";

export type PublicOrder = {
  number: number | null;
  status: OrderStatus;
  createdAt: string;
  customerName: string;
  notes: string;
  fulfilment: "collection" | "eat_in";
  table: string | null;
  lines: { number: number; nameEn: string; nameZh: string; qty: number; unitPricePence: number }[];
  totalPence: number;
  payment: { method: PayWith; status: "due" | "paid" };
  clientSecret: string | null;
  payBy: string | null;
};

export type PlaceOrderInput = {
  customerName: string;
  phone: string;
  notes: string;
  lines: { number: number; qty: number }[];
  payWith: PayWith;
  allergensConfirmed: boolean;
  /** Set when ordering from a table's link: the order is brought to it. */
  table: string | null;
};

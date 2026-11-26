import type { Ordering } from "./types";

export type Way = "eat_in" | "collection" | "delivery";

/** What this visit may order, given the shop's settings and any table link. */
export type Offer = {
  open: boolean;
  /** Why not, or why the table link was set aside. */
  reason: "closed" | "table_off" | "table_only" | null;
  ways: Way[];
};

/**
 * The shop server refuses anything else; this decides what to offer. A table
 * link orders eat-in when the shop takes table orders; when it does not, the
 * link falls back to collection if that is on, and takes no order if not.
 */
export function offerFor(ordering: Ordering, table: string | null): Offer {
  if (!ordering.acceptingOrders) return { open: false, reason: "closed", ways: [] };
  if (table) {
    if (ordering.table) return { open: true, reason: null, ways: ["eat_in"] };
    return ordering.collection ? { open: true, reason: "table_off", ways: ["collection"] } : { open: false, reason: "table_off", ways: [] };
  }
  const ways: Way[] = [];
  if (ordering.collection) ways.push("collection");
  if (ordering.delivery) ways.push("delivery");
  // Only table ordering is on: order by scanning a table's code.
  return ways.length ? { open: true, reason: null, ways } : { open: false, reason: "table_only", ways: [] };
}

export type PayWay = "card" | "at_shop" | "bank_transfer";

/** The ways to pay for this kind of order: cash only to the shop's own driver. */
export function payWaysFor(ordering: Ordering, way: Way): PayWay[] {
  const ways: PayWay[] = [];
  if (ordering.card) ways.push("card");
  if (way === "delivery" ? ordering.cashOnDelivery : ordering.payInPerson) ways.push("at_shop");
  if (ordering.bankTransfer) ways.push("bank_transfer");
  return ways;
}

/** Older shop servers do not say: they take what v0.1 always took. */
export function orderingOf(shop: { ordering?: Ordering | null; payments: { card: boolean; atShop: boolean } }): Ordering {
  return (
    shop.ordering ?? {
      acceptingOrders: true,
      table: true,
      collection: true,
      delivery: false,
      deliveryFeePence: null,
      deliveryMinimumPence: null,
      payInPerson: shop.payments.atShop,
      cashOnDelivery: false,
      card: shop.payments.card,
      bankTransfer: false,
    }
  );
}

/**
 * The delivery fee to show: the shop's fixed fee, or for Uber the quote for
 * this address (free over the shop's amount). Null: not known until quoted.
 */
export function deliveryFeeFor(ordering: Ordering, quoteFeePence: number | null, foodPence: number): number | null {
  if (!ordering.deliveryQuoted) return ordering.deliveryFeePence ?? 0;
  if (ordering.deliveryFreeOverPence != null && foodPence >= ordering.deliveryFreeOverPence) return 0;
  return quoteFeePence;
}

/** A UK postcode, roughly, as the server checks it. */
export function postcodeLooksRight(value: string): boolean {
  return /^[A-Z][A-Z0-9]{1,3}[0-9][A-Z]{2}$/.test(value.replace(/\s+/g, "").toUpperCase());
}

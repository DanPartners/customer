import type { Allergen, MenuItem } from "./types";

/** The server's limits, mirrored so the basket never builds an order it will refuse. */
export const MAX_QTY = 20;
export const MAX_LINES = 30;
export const MAX_ORDER_PENCE = 50_000;

export type Basket = Record<number, number>;

export function add(basket: Basket, number: number, by = 1): Basket {
  const current = basket[number] ?? 0;
  if (!current && Object.keys(basket).length >= MAX_LINES) return basket;
  const qty = Math.min(MAX_QTY, Math.max(0, current + by));
  const next = { ...basket };
  if (qty === 0) delete next[number];
  else next[number] = qty;
  return next;
}

export type BasketLine = { item: MenuItem; qty: number; totalPence: number };

/** The basket against the current menu. Dishes no longer on it, or sold out, are left out. */
export function lines(basket: Basket, items: MenuItem[]): BasketLine[] {
  return Object.entries(basket)
    .map(([number, qty]) => ({ item: items.find((entry) => entry.number === Number(number)), qty }))
    .filter((line): line is { item: MenuItem; qty: number } => Boolean(line.item) && !line.item!.soldOut && line.qty > 0)
    .map(({ item, qty }) => ({ item, qty, totalPence: item.pricePence * qty }))
    .sort((a, b) => a.item.number - b.item.number);
}

export function count(basketLines: BasketLine[]): number {
  return basketLines.reduce((sum, line) => sum + line.qty, 0);
}

/** For display only. The shop server prices the order itself. */
export function total(basketLines: BasketLine[]): number {
  return basketLines.reduce((sum, line) => sum + line.totalPence, 0);
}

/** Every allergen in the order, including those in the dishes of a set meal. */
export function allergensIn(basketLines: BasketLine[], items: MenuItem[]): Allergen[] {
  const found = new Set<Allergen>();
  for (const { item } of basketLines) {
    for (const allergen of item.allergens) found.add(allergen);
    for (const include of item.includes) {
      for (const allergen of items.find((entry) => entry.number === include.number)?.allergens ?? []) found.add(allergen);
    }
  }
  return [...found].sort();
}

/** Reads a stored basket, keeping only sensible entries. */
export function parse(value: unknown): Basket {
  if (!value || typeof value !== "object") return {};
  const basket: Basket = {};
  for (const [key, qty] of Object.entries(value as Record<string, unknown>)) {
    const number = Number(key);
    if (Number.isInteger(number) && number >= 1 && number <= 999 && Number.isInteger(qty) && (qty as number) >= 1) {
      basket[number] = Math.min(MAX_QTY, qty as number);
    }
    if (Object.keys(basket).length >= MAX_LINES) break;
  }
  return basket;
}

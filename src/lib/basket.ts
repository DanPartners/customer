import type { Addon, Allergen, MenuItem, OptionChoice, OrderLineInput } from "./types";

/** The server's limits, mirrored so the basket never builds an order it will refuse. */
export const MAX_QTY = 20;
export const MAX_LINES = 30;
export const MAX_ORDER_PENCE = 50_000;

/**
 * One line of the basket: a dish, how many, and how it is taken (the ids of
 * the option choices and of the add-ons for the dish). The same dish taken
 * two ways is two lines.
 */
export type BasketEntry = { number: number; qty: number; options: string[]; addons: string[] };
export type Basket = BasketEntry[];

type Taken = Pick<BasketEntry, "number" | "options" | "addons">;

/** What tells one line from another: the dish, and how it is taken. */
export function keyOf(entry: Taken): string {
  return `${entry.number}|${[...entry.options].sort().join(",")}|${[...entry.addons].sort().join(",")}`;
}

/** A dish as it comes, with nothing chosen. */
export const plain = (number: number): Taken => ({ number, options: [], addons: [] });

/** Adds to a line (or takes from it, with a minus). A line at nothing goes; a new line is refused once the basket is full. */
export function add(basket: Basket, taken: Taken, by = 1): Basket {
  const key = keyOf(taken);
  const at = basket.findIndex((entry) => keyOf(entry) === key);
  if (at < 0) {
    if (by <= 0 || basket.length >= MAX_LINES) return basket;
    return [...basket, { number: taken.number, qty: Math.min(MAX_QTY, by), options: [...taken.options], addons: [...taken.addons] }];
  }
  const qty = Math.min(MAX_QTY, Math.max(0, basket[at].qty + by));
  return qty === 0 ? basket.filter((_, index) => index !== at) : basket.map((entry, index) => (index === at ? { ...entry, qty } : entry));
}

/** How many of a dish are in the basket, however they are taken. */
export function countOf(basket: Basket, number: number): number {
  return basket.filter((entry) => entry.number === number).reduce((sum, entry) => sum + entry.qty, 0);
}

export type BasketLine = {
  key: string;
  /** The line as it is kept in the basket, for adding to it and taking from it. */
  entry: BasketEntry;
  item: MenuItem;
  qty: number;
  /** The choices taken, in the dish's own order. */
  choices: OptionChoice[];
  /** The add-ons for the dish that were ticked, in the shop's order. Required ones are the shop's to add. */
  addons: Addon[];
  /** One of the dish with its choices: the menu's price and what each choice adds. */
  unitPence: number;
};

/**
 * What the first choices of a dish are: one of each "choose one" group (its
 * first), none of the others. What the shop takes when nothing is named.
 */
export function firstChoices(item: MenuItem): string[] {
  return (item.options ?? []).filter((group) => group.kind === "one" && group.choices.length > 0).map((group) => group.choices[0].id);
}

/** The choices of a dish that the ids name, or null when they do not fit the dish as it is now. */
function choicesFor(item: MenuItem, ids: string[]): OptionChoice[] | null {
  const groups = item.options ?? [];
  if (ids.some((id) => !groups.some((group) => group.choices.some((choice) => choice.id === id)))) return null;
  const taken: OptionChoice[] = [];
  for (const group of groups) {
    const picked = group.choices.filter((choice) => ids.includes(choice.id));
    if (group.kind === "one" && picked.length > 1) return null;
    // None named (the group was added since): the first, as the shop itself would take.
    taken.push(...(group.kind === "one" && picked.length === 0 ? group.choices.slice(0, 1) : picked));
  }
  return taken;
}

/**
 * The basket against the menu as it is now. A line is left out when its dish
 * has gone or sold out, or when what was chosen no longer fits it (the owner
 * changed its options since): the shop would refuse it.
 */
export function lines(basket: Basket, items: MenuItem[], shopAddons: Addon[] = []): BasketLine[] {
  const forDish = shopAddons.filter((addon) => addon.scope === "dish");
  return basket.flatMap((entry) => {
    const item = items.find((candidate) => candidate.number === entry.number);
    if (!item || item.soldOut || entry.qty < 1) return [];
    const choices = choicesFor(item, entry.options);
    if (!choices || entry.addons.some((id) => !forDish.some((addon) => addon.id === id))) return [];
    return [
      {
        key: keyOf(entry),
        entry,
        item,
        qty: entry.qty,
        choices,
        addons: forDish.filter((addon) => entry.addons.includes(addon.id)),
        unitPence: item.pricePence + choices.reduce((sum, choice) => sum + choice.pricePence, 0),
      },
    ];
  });
}

export function count(basketLines: BasketLine[]): number {
  return basketLines.reduce((sum, line) => sum + line.qty, 0);
}

/**
 * The dishes with their choices, and no add-ons. For display only: it is
 * the whole bill only where the shop has no add-ons; otherwise the shop
 * works the bill out (`quote`), and always when the order is placed.
 */
export function total(basketLines: BasketLine[]): number {
  return basketLines.reduce((sum, line) => sum + line.unitPence * line.qty, 0);
}

/** Every allergen in the order: the dishes, the dishes of a set meal, and the choices taken. */
export function allergensIn(basketLines: BasketLine[], items: MenuItem[]): Allergen[] {
  const found = new Set<Allergen>();
  for (const { item, choices } of basketLines) {
    for (const allergen of item.allergens) found.add(allergen);
    for (const choice of choices) for (const allergen of choice.allergens) found.add(allergen);
    for (const include of item.includes) {
      for (const allergen of items.find((entry) => entry.number === include.number)?.allergens ?? []) found.add(allergen);
    }
  }
  return [...found].sort();
}

/**
 * The basket as an order asks for it. `explicit`: the shop has options or
 * add-ons, so each line says exactly how it is taken. A shop with neither
 * gets a dish and how many, as every shop server understands.
 */
export function orderLines(basketLines: BasketLine[], explicit: boolean): OrderLineInput[] {
  return basketLines.map((line) =>
    explicit
      ? { number: line.item.number, qty: line.qty, options: line.choices.map((choice) => choice.id), addons: line.addons.map((addon) => addon.id) }
      : { number: line.item.number, qty: line.qty },
  );
}

const ID = /^[a-z0-9_-]{1,32}$/;
const ids = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && ID.test(id)))].slice(0, 40) : []);

/** Reads a stored basket, keeping only sensible entries. One saved before options (dish number to quantity) is read too. */
export function parse(value: unknown): Basket {
  if (!value || typeof value !== "object") return [];
  const entries: unknown[] = Array.isArray(value) ? value : Object.entries(value as Record<string, unknown>).map(([number, qty]) => ({ number: Number(number), qty }));
  let basket: Basket = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const { number, qty, options, addons } = raw as Record<string, unknown>;
    if (!Number.isInteger(number) || (number as number) < 1 || (number as number) > 999 || !Number.isInteger(qty) || (qty as number) < 1) continue;
    basket = add(basket, { number: number as number, options: ids(options), addons: ids(addons) }, qty as number);
    if (basket.length >= MAX_LINES) break;
  }
  return basket;
}

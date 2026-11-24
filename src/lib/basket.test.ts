import { describe, expect, it } from "vitest";
import { add, allergensIn, count, lines, MAX_LINES, MAX_QTY, parse, total } from "./basket";
import type { MenuItem } from "./types";

function dish(number: number, pricePence: number, extra: Partial<MenuItem> = {}): MenuItem {
  return {
    id: `item-${number}`,
    number,
    categoryId: "rice",
    nameEn: `Dish ${number}`,
    nameZh: "飯",
    descriptionEn: "",
    pricePence,
    allergens: [],
    soldOut: false,
    kind: "item",
    includes: [],
    ...extra,
  };
}

const menu = [
  dish(81, 390, { allergens: ["eggs", "soya"] }),
  dish(25, 820, { allergens: ["gluten"] }),
  dish(201, 1240, { kind: "set", includes: [{ number: 25, qty: 1 }, { number: 81, qty: 1 }], allergens: ["sesame"] }),
  dish(5, 300, { soldOut: true }),
];

describe("basket", () => {
  it("adds, removes and caps a dish at the server's limit", () => {
    let basket = add({}, 81);
    basket = add(basket, 81);
    expect(basket).toEqual({ 81: 2 });
    expect(add(basket, 81, -2)).toEqual({});
    expect(add({}, 81, 50)).toEqual({ 81: MAX_QTY });
  });

  it("refuses a new dish once the order has as many lines as the server allows", () => {
    let basket = {};
    for (let n = 1; n <= MAX_LINES; n += 1) basket = add(basket, n);
    expect(add(basket, 999)).toBe(basket);
    expect(add(basket, 1)).toEqual({ ...basket, 1: 2 });
  });

  it("prices against the current menu and drops dishes that are gone or sold out", () => {
    const found = lines({ 81: 2, 5: 1, 777: 3 }, menu);
    expect(found.map((line) => line.item.number)).toEqual([81]);
    expect(count(found)).toBe(2);
    expect(total(found)).toBe(780);
  });

  it("lists every allergen, including those inside a set meal", () => {
    expect(allergensIn(lines({ 201: 1 }, menu), menu)).toEqual(["eggs", "gluten", "sesame", "soya"]);
  });

  it("reads a stored basket defensively", () => {
    expect(parse({ 81: 2, x: 1, 0: 3, 1000: 1, 25: -1, 201: 2.5, 5: 99 })).toEqual({ 81: 2, 5: MAX_QTY });
    expect(parse("nonsense")).toEqual({});
    expect(parse(null)).toEqual({});
  });
});

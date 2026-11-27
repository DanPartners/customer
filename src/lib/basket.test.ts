import { describe, expect, it } from "vitest";
import { add, allergensIn, count, countOf, firstChoices, keyOf, lines, MAX_LINES, MAX_QTY, orderLines, parse, plain, total, type Basket } from "./basket";
import type { Addon, MenuItem, OptionGroup } from "./types";

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

const SIZES: OptionGroup[] = [
  {
    id: "size",
    nameEn: "Size",
    nameZh: "份量",
    kind: "one",
    choices: [
      { id: "regular", nameEn: "Regular", nameZh: "正常", pricePence: 0, allergens: [] },
      { id: "large", nameEn: "Large", nameZh: "大", pricePence: 150, allergens: [] },
    ],
  },
  { id: "extras", nameEn: "Extras", nameZh: "加料", kind: "any", choices: [{ id: "egg", nameEn: "Fried egg", nameZh: "煎蛋", pricePence: 80, allergens: ["eggs", "milk"] }] },
];
const withSizes = menu.map((item) => (item.number === 25 ? { ...item, options: SIZES } : item));
const addon = (id: string, scope: Addon["scope"], more: Partial<Addon> = {}): Addon => ({ id, nameEn: id, nameZh: id, scope, kind: "fixed", value: 50, auto: false, required: false, ...more });
const entry = (number: number, qty: number, options: string[] = [], addons: string[] = []) => ({ number, qty, options, addons });

describe("basket", () => {
  it("adds, removes and caps a dish at the server's limit", () => {
    let basket = add([], plain(81));
    basket = add(basket, plain(81));
    expect(basket).toEqual([entry(81, 2)]);
    expect(add(basket, plain(81), -2)).toEqual([]);
    expect(add([], plain(81), 50)).toEqual([entry(81, MAX_QTY)]);
    // Taking from a line that is not there does nothing.
    expect(add([], plain(81), -1)).toEqual([]);
  });

  it("keeps the same dish taken two ways as two lines", () => {
    let basket = add([], { number: 25, options: ["large", "egg"], addons: ["sauce"] }, 2);
    // The same choices in another order are the same line.
    basket = add(basket, { number: 25, options: ["egg", "large"], addons: ["sauce"] });
    basket = add(basket, { number: 25, options: ["regular"], addons: [] });
    expect(basket.map((line) => [keyOf(line), line.qty])).toEqual([
      ["25|egg,large|sauce", 3],
      ["25|regular|", 1],
    ]);
    expect(countOf(basket, 25)).toBe(4);
    expect(countOf(basket, 81)).toBe(0);
  });

  it("refuses a new line once the order has as many as the server allows", () => {
    let basket: Basket = [];
    for (let n = 1; n <= MAX_LINES; n += 1) basket = add(basket, plain(n));
    expect(add(basket, plain(999))).toBe(basket);
    expect(add(basket, plain(1))[0]).toEqual(entry(1, 2));
  });

  it("prices against the current menu and drops dishes that are gone or sold out", () => {
    const found = lines([entry(81, 2), entry(5, 1), entry(777, 3)], menu);
    expect(found.map((line) => line.item.number)).toEqual([81]);
    expect(count(found)).toBe(2);
    expect(total(found)).toBe(780);
  });

  it("adds what each choice costs to the dish, and says exactly how each line is taken", () => {
    const sauce = addon("sauce", "dish");
    const found = lines([entry(25, 2, ["egg", "large"], ["sauce"]), entry(25, 1, ["regular"]), entry(81, 1)], withSizes, [sauce, addon("bag", "bill")]);
    // 8.20 + 1.50 + 0.80, and the plain one.
    expect(found.map((line) => line.unitPence)).toEqual([1050, 820, 390]);
    expect(found[0].choices.map((choice) => choice.id)).toEqual(["large", "egg"]);
    expect(found[0].addons).toEqual([sauce]);
    expect(total(found)).toBe(2 * 1050 + 820 + 390);
    expect(orderLines(found, true)).toEqual([
      { number: 25, qty: 2, options: ["large", "egg"], addons: ["sauce"] },
      { number: 25, qty: 1, options: ["regular"], addons: [] },
      { number: 81, qty: 1, options: [], addons: [] },
    ]);
    // A shop with no options and no add-ons gets a dish and how many, as before.
    expect(orderLines(lines([entry(81, 2)], menu), false)).toEqual([{ number: 81, qty: 2 }]);
    expect(firstChoices(withSizes.find((item) => item.number === 25)!)).toEqual(["regular"]);
    expect(firstChoices(menu[0])).toEqual([]);
  });

  it("leaves out a line whose choices no longer fit the dish, rather than send what the shop would refuse", () => {
    const sauce = addon("sauce", "dish");
    const fits = (line: ReturnType<typeof entry>, addons: Addon[] = [sauce]) => lines([line], withSizes, addons).length === 1;
    expect(fits(entry(25, 1, ["large"]))).toBe(true);
    // A choice the dish no longer has; two sizes at once; an add-on the shop has taken away, or one for the bill.
    expect(fits(entry(25, 1, ["jumbo"]))).toBe(false);
    expect(fits(entry(25, 1, ["regular", "large"]))).toBe(false);
    expect(fits(entry(25, 1, ["large"], ["sauce"]), [])).toBe(false);
    expect(fits(entry(25, 1, ["large"], ["bag"]), [addon("bag", "bill")])).toBe(false);
    expect(fits(entry(81, 1, ["large"]))).toBe(false);
    // No size named (the owner added sizes since): the first, as the shop itself would take.
    const defaulted = lines([entry(25, 1)], withSizes);
    expect(defaulted[0].choices.map((choice) => choice.id)).toEqual(["regular"]);
    expect(defaulted[0].unitPence).toBe(820);
  });

  it("lists every allergen: the dishes, those inside a set meal, and the choices taken", () => {
    expect(allergensIn(lines([entry(201, 1)], menu), menu)).toEqual(["eggs", "gluten", "sesame", "soya"]);
    expect(allergensIn(lines([entry(25, 1, ["regular"])], withSizes), withSizes)).toEqual(["gluten"]);
    // The fried egg brings eggs and milk that the dish itself does not have.
    expect(allergensIn(lines([entry(25, 1, ["regular", "egg"])], withSizes), withSizes)).toEqual(["eggs", "gluten", "milk"]);
  });

  it("reads a stored basket defensively, one saved before options included", () => {
    // Before options, the basket was dish number to quantity.
    expect(parse({ 81: 2, x: 1, 0: 3, 1000: 1, 25: -1, 201: 2.5, 5: 99 })).toEqual([entry(5, MAX_QTY), entry(81, 2)]);
    expect(parse("nonsense")).toEqual([]);
    expect(parse(null)).toEqual([]);
    expect(
      parse([
        { number: 25, qty: 2, options: ["large", "large", "<script>", 7], addons: ["sauce"] },
        { number: 25, qty: 1, options: ["large"], addons: ["sauce"] },
        { number: 81, qty: 0 },
        { number: "81", qty: 1 },
        null,
        "x",
      ]),
    ).toEqual([entry(25, 3, ["large"], ["sauce"])]);
  });
});

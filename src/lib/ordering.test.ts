import { describe, expect, it } from "vitest";
import { offerFor, payWaysFor, postcodeLooksRight } from "./ordering";
import type { Ordering } from "./types";

const v01: Ordering = {
  acceptingOrders: true,
  table: true,
  collection: true,
  delivery: false,
  deliveryFeePence: null,
  deliveryMinimumPence: null,
  payInPerson: true,
  cashOnDelivery: false,
  card: true,
  bankTransfer: false,
};

describe("what a visit may order", () => {
  it("is eat-in from a table's link, and collection otherwise", () => {
    expect(offerFor(v01, "7")).toEqual({ open: true, reason: null, ways: ["eat_in"] });
    expect(offerFor(v01, null)).toEqual({ open: true, reason: null, ways: ["collection"] });
  });

  it("falls back to collection when table ordering is off, or takes no order", () => {
    expect(offerFor({ ...v01, table: false }, "7")).toEqual({ open: true, reason: "table_off", ways: ["collection"] });
    expect(offerFor({ ...v01, table: false, collection: false, delivery: true }, "7")).toEqual({ open: false, reason: "table_off", ways: [] });
  });

  it("is nothing when the shop takes no online orders, and only by table when that is all", () => {
    expect(offerFor({ ...v01, acceptingOrders: false }, null).open).toBe(false);
    expect(offerFor({ ...v01, collection: false }, null)).toEqual({ open: false, reason: "table_only", ways: [] });
    expect(offerFor({ ...v01, delivery: true }, null).ways).toEqual(["collection", "delivery"]);
  });
});

describe("ways to pay", () => {
  it("follow the shop's methods, with cash only to the shop's own driver", () => {
    expect(payWaysFor(v01, "collection")).toEqual(["card", "at_shop"]);
    expect(payWaysFor({ ...v01, card: false, bankTransfer: true }, "eat_in")).toEqual(["at_shop", "bank_transfer"]);
    expect(payWaysFor({ ...v01, delivery: true, cashOnDelivery: false }, "delivery")).toEqual(["card"]);
    expect(payWaysFor({ ...v01, delivery: true, cashOnDelivery: true }, "delivery")).toEqual(["card", "at_shop"]);
  });

  it("check postcodes as the server roughly does", () => {
    expect(postcodeLooksRight("wd17 1ab")).toBe(true);
    expect(postcodeLooksRight("M1 1AE")).toBe(true);
    expect(postcodeLooksRight("12345")).toBe(false);
  });
});

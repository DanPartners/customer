import { describe, expect, it } from "vitest";
import { deliveryFeeFor, offerFor, payWaysFor, postcodeLooksRight } from "./ordering";
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

describe("the delivery fee shown at checkout", () => {
  const uber = { ...v01, delivery: true, deliveryQuoted: true, deliveryFeePence: null, deliveryMinimumPence: 1000, deliveryFreeOverPence: 3000 };
  it("is the shop's fixed fee when it delivers itself", () => {
    expect(deliveryFeeFor({ ...v01, delivery: true, deliveryFeePence: 250 }, null, 1200)).toBe(250);
  });
  it("is unknown for Uber until quoted, then the quote", () => {
    expect(deliveryFeeFor(uber, null, 1200)).toBeNull();
    expect(deliveryFeeFor(uber, 549, 1200)).toBe(549);
  });
  it("is free for food over the shop's amount, quoted or not", () => {
    expect(deliveryFeeFor(uber, null, 3000)).toBe(0);
    expect(deliveryFeeFor(uber, 549, 3120)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { ApiError, apiBase, call, graphqlUrl, isToken, loadOrder, loadShop, orderFields, placeOrder, quote, shopName } from "./api";

function fake(body: unknown, status = 200) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  };
  return { fetchImpl, seen };
}

describe("public API client", () => {
  it("calls the Dan cloud it was built with, and nothing else", () => {
    expect(apiBase("https://cloud.dan.partners/")).toBe("https://cloud.dan.partners");
    expect(apiBase("http://localhost:2290")).toBe("http://localhost:2290");
    expect(apiBase("")).toBeNull();
    expect(apiBase(undefined)).toBeNull();
    expect(apiBase("javascript:alert(1)")).toBeNull();
  });

  it("names its shop by the address it is visited at, unless told", () => {
    expect(shopName(undefined, "GoldenDragon.dan.partners")).toBe("goldendragon.dan.partners");
    expect(shopName(undefined, "order.goldendragon.co.uk")).toBe("order.goldendragon.co.uk");
    expect(shopName("goldendragon", "localhost")).toBe("goldendragon");
    expect(shopName("", "lotus.dan.partners")).toBe("lotus.dan.partners");
    for (const bad of ["", "a b", "x/../y", "evil.example?x=1", "-x", "a..b", "javascript:alert(1)"]) expect(shopName(bad, undefined)).toBeNull();
    expect(shopName(undefined, undefined)).toBeNull();
    expect(graphqlUrl("https://cloud.dan.partners", "order.goldendragon.co.uk")).toBe("https://cloud.dan.partners/graphql?shop=order.goldendragon.co.uk");
  });

  it("posts to the cloud's /graphql, naming the shop, without cookies or a referrer", async () => {
    const { fetchImpl, seen } = fake({ data: { order: { number: 1 } } });
    await loadOrder("a".repeat(32), { fetchImpl, base: "https://api.shop.example", shop: "goldendragon.dan.partners" });
    expect(seen[0].url).toBe("https://api.shop.example/graphql?shop=goldendragon.dan.partners");
    expect(seen[0].init.credentials).toBe("omit");
    expect(seen[0].init.referrerPolicy).toBe("no-referrer");
  });

  it("sends dish numbers and quantities only; the server sets the prices", async () => {
    const { fetchImpl, seen } = fake({ data: { placeOrder: { token: "t", order: {} } } });
    await placeOrder(
      { customerName: "Alex", phone: "07700 900123", notes: "", lines: [{ number: 81, qty: 2 }], payWith: "at_shop", allergensConfirmed: true, table: "3" },
      { fetchImpl, base: "https://api.shop.example", shop: "goldendragon.dan.partners" },
    );
    const body = JSON.parse(String(seen[0].init.body)) as { variables: { input: Record<string, unknown> } };
    expect(body.variables.input.lines).toEqual([{ number: 81, qty: 2 }]);
    expect(body.variables.input.table).toBe("3");
    expect(JSON.stringify(body.variables)).not.toContain("Pence");
  });

  it("says how each dish is taken, and which add-ons are ticked; still no prices", async () => {
    const { fetchImpl, seen } = fake({ data: { placeOrder: { token: "t", order: {} } } });
    await placeOrder(
      { customerName: "Alex", phone: "07700 900123", notes: "", lines: [{ number: 81, qty: 2, options: ["large"], addons: ["sauce"] }], addons: ["bag"], payWith: "card", allergensConfirmed: true, table: null },
      { fetchImpl, base: "https://api.shop.example", shop: "goldendragon.dan.partners" },
    );
    const body = JSON.parse(String(seen[0].init.body)) as { variables: { input: Record<string, unknown> } };
    expect(body.variables.input.lines).toEqual([{ number: 81, qty: 2, options: ["large"], addons: ["sauce"] }]);
    expect(body.variables.input.addons).toEqual(["bag"]);
    expect(JSON.stringify(body.variables)).not.toContain("Pence");
  });

  it("asks the shop what a basket comes to", async () => {
    const answer = { totalPence: 1407, addons: [{ id: "service", nameEn: "Service charge", nameZh: "服務費", kind: "percent", value: 1000, amountPence: 134 }], lines: [] };
    const { fetchImpl, seen } = fake({ data: { quote: answer } });
    expect(await quote({ lines: [{ number: 81, qty: 2, options: ["large"], addons: [] }], addons: [] }, { fetchImpl, base: "https://api.shop.example", shop: "goldendragon.dan.partners" })).toEqual(answer);
    const body = JSON.parse(String(seen[0].init.body)) as { query: string; variables: { input: unknown } };
    expect(body.query).toContain("quote(input: $input)");
    expect(body.variables.input).toEqual({ lines: [{ number: 81, qty: 2, options: ["large"], addons: [] }], addons: [] });
  });

  it("loads the menu with options and the shop's add-ons, and without them from a shop server that knows neither", async () => {
    const shop = { name: "Golden Dragon", theme: null };
    const modern = fake({ data: { shop, menu: { categories: [], items: [{ id: "item-81", options: [] }] }, addons: [{ id: "bag" }] } });
    const loaded = await loadShop({ fetchImpl: modern.fetchImpl, base: "https://api.shop.example", shop: "goldendragon.dan.partners" });
    expect(loaded.menu.addons).toEqual([{ id: "bag" }]);
    expect(String(modern.seen[0].init.body)).toContain("options { id");
    expect(orderFields()).toContain("addons {");

    // An older shop server refuses the fields it does not know: asked again without them.
    const seen: string[] = [];
    const older = (_input: RequestInfo | URL, init?: RequestInit) => {
      const { query } = JSON.parse(String(init?.body)) as { query: string };
      seen.push(query);
      const body = /\b(options|addons)\b/.test(query) ? { data: null, errors: [{ message: 'Unknown field "addons" on type "Query".' }] } : { data: { shop, menu: { categories: [], items: [{ id: "item-81" }] } } };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    };
    const plain = await loadShop({ fetchImpl: older, base: "https://api.shop.example", shop: "goldendragon.dan.partners" });
    expect(seen).toHaveLength(2);
    expect(plain.menu.addons).toEqual([]);
    expect(plain.menu.items[0].id).toBe("item-81");
    // Orders are then asked for as that server knows them.
    expect(orderFields()).not.toContain("addons {");
    await loadShop({ fetchImpl: modern.fetchImpl, base: "https://api.shop.example", shop: "goldendragon.dan.partners" });
    expect(orderFields()).toContain("addons {");
  });

  it("passes the server's error code through", async () => {
    const { fetchImpl } = fake({ data: null, errors: [{ message: "Busy", extensions: { code: "busy" } }] });
    await expect(call("{ shop { name } }", {}, { fetchImpl, base: "https://api.shop.example", shop: "goldendragon.dan.partners" })).rejects.toEqual(new ApiError("busy", "Busy"));
    const refused = fake({ errors: [{ message: "No", extensions: { code: "forbidden_origin" } }] }, 403);
    await expect(call("{ x }", {}, { fetchImpl: refused.fetchImpl, base: "https://x.example", shop: "goldendragon" })).rejects.toMatchObject({ code: "forbidden_origin" });
  });

  it("says so when no shop is set up, and when the shop cannot be reached", async () => {
    await expect(call("{ x }", {}, { base: null })).rejects.toMatchObject({ code: "not_configured" });
    await expect(call("{ x }", {}, { base: "https://x.example", shop: null })).rejects.toMatchObject({ code: "not_configured" });
    const down = () => Promise.reject(new TypeError("failed to fetch"));
    await expect(call("{ x }", {}, { fetchImpl: down, base: "https://x.example", shop: "goldendragon" })).rejects.toMatchObject({ code: "unreachable" });
  });

  it("only looks up well-formed private links", () => {
    expect(isToken("0123456789abcdef0123456789abcdef")).toBe(true);
    for (const bad of ["", "abc", "0123456789ABCDEF0123456789ABCDEF", "../../graphql", "g".repeat(32)]) expect(isToken(bad)).toBe(false);
  });
});

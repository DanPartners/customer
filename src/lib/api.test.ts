import { describe, expect, it } from "vitest";
import { ApiError, call, isToken, loadOrder, placeOrder } from "./api";

function fake(body: unknown, status = 200) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  };
  return { fetchImpl, seen };
}

describe("public API client", () => {
  it("posts to /graphql without cookies or a referrer", async () => {
    const { fetchImpl, seen } = fake({ data: { order: { number: 1 } } });
    await loadOrder("a".repeat(32), { fetchImpl, base: "https://api.shop.example" });
    expect(seen[0].url).toBe("https://api.shop.example/graphql");
    expect(seen[0].init.credentials).toBe("omit");
    expect(seen[0].init.referrerPolicy).toBe("no-referrer");
  });

  it("sends dish numbers and quantities only; the server sets the prices", async () => {
    const { fetchImpl, seen } = fake({ data: { placeOrder: { token: "t", order: {} } } });
    await placeOrder(
      { customerName: "Alex", phone: "07700 900123", notes: "", lines: [{ number: 81, qty: 2 }], payWith: "at_shop", allergensConfirmed: true },
      { fetchImpl, base: "https://api.shop.example" },
    );
    const body = JSON.parse(String(seen[0].init.body)) as { variables: { input: Record<string, unknown> } };
    expect(body.variables.input.lines).toEqual([{ number: 81, qty: 2 }]);
    expect(JSON.stringify(body.variables)).not.toContain("Pence");
  });

  it("passes the server's error code through", async () => {
    const { fetchImpl } = fake({ data: null, errors: [{ message: "Busy", extensions: { code: "busy" } }] });
    await expect(call("{ shop { name } }", {}, { fetchImpl, base: "https://api.shop.example" })).rejects.toEqual(new ApiError("busy", "Busy"));
    const refused = fake({ errors: [{ message: "No", extensions: { code: "forbidden_origin" } }] }, 403);
    await expect(call("{ x }", {}, { fetchImpl: refused.fetchImpl, base: "https://x.example" })).rejects.toMatchObject({ code: "forbidden_origin" });
  });

  it("says so when no shop is set up, and when the shop cannot be reached", async () => {
    await expect(call("{ x }", {}, { base: null })).rejects.toMatchObject({ code: "not_configured" });
    const down = () => Promise.reject(new TypeError("failed to fetch"));
    await expect(call("{ x }", {}, { fetchImpl: down, base: "https://x.example" })).rejects.toMatchObject({ code: "unreachable" });
  });

  it("only looks up well-formed private links", () => {
    expect(isToken("0123456789abcdef0123456789abcdef")).toBe(true);
    for (const bad of ["", "abc", "0123456789ABCDEF0123456789ABCDEF", "../../graphql", "g".repeat(32)]) expect(isToken(bad)).toBe(false);
  });
});

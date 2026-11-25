import { describe, expect, it } from "vitest";
import { apiOrigins, visitedAddress } from "./proxy";

describe("security policy addresses", () => {
  it("allows the site's own live channel when the API shares its address", () => {
    const behindTunnel = visitedAddress(new Headers({ host: "front", "x-forwarded-host": "order.goldendragon.example", "x-forwarded-proto": "https" }), "http:");
    expect(behindTunnel).toEqual({ secure: true, host: "order.goldendragon.example" });
    expect(apiOrigins(undefined, behindTunnel)).toEqual(["wss://order.goldendragon.example"]);
    const onTheShopNetwork = visitedAddress(new Headers({ host: "192.168.1.20:8080" }), "http:");
    expect(apiOrigins("", onTheShopNetwork)).toEqual(["ws://192.168.1.20:8080"]);
  });

  it("uses a configured API address instead", () => {
    const visited = visitedAddress(new Headers({ host: "order.goldendragon.example" }), "https:");
    expect(apiOrigins("https://api.goldendragon.example", visited)).toEqual(["https://api.goldendragon.example", "wss://api.goldendragon.example"]);
  });

  it("never lets a forged host into the policy", () => {
    for (const host of ["evil.example; script-src *", "a b", "x'y", "", "évil.example"]) {
      const visited = visitedAddress(new Headers({ "x-forwarded-host": host }), "https:");
      expect(apiOrigins(undefined, visited).join(" ")).not.toMatch(/[;'\s]/);
    }
  });
});

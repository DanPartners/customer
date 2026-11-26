import { describe, expect, it } from "vitest";
import { primaryName, secondaryName } from "./format";

describe("names in two languages", () => {
  it("shows the reader's language first and the other second", () => {
    expect(primaryName("Egg fried rice", "蛋炒飯", "en")).toBe("Egg fried rice");
    expect(secondaryName("Egg fried rice", "蛋炒飯", "en")).toBe("蛋炒飯");
    expect(primaryName("Egg fried rice", "蛋炒飯", "zh-Hant")).toBe("蛋炒飯");
    expect(secondaryName("Egg fried rice", "蛋炒飯", "zh-Hant")).toBe("Egg fried rice");
  });

  it("shows one name once when there is only one", () => {
    // A dish named in one language carries that name for both.
    expect(primaryName("Sourdough loaf", "Sourdough loaf", "zh-Hant")).toBe("Sourdough loaf");
    expect(secondaryName("Sourdough loaf", "Sourdough loaf", "zh-Hant")).toBe("");
    // A shop with no Chinese name still has a heading in Chinese.
    expect(primaryName("Corner Bakery", "", "zh-Hant")).toBe("Corner Bakery");
    expect(secondaryName("Corner Bakery", "", "en")).toBe("");
  });
});

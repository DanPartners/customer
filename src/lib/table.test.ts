import { describe, expect, it } from "vitest";
import { tableName } from "./table";

describe("table names from a link", () => {
  it("keeps short plain names, tidying spaces", () => {
    expect(tableName("3")).toBe("3");
    expect(tableName("  Patio   2 ")).toBe("Patio 2");
    expect(tableName("窗邊-1")).toBe("窗邊-1");
  });

  it("ignores anything a link should not carry", () => {
    for (const bad of [null, "", "   ", "Table number twelve", "<script>", "1;2", "a/b", '"3"']) {
      expect(tableName(bad)).toBeNull();
    }
  });
});

import { describe, expect, it } from "vitest";
import { photoUrl } from "./api";

const photo = `images/${"c".repeat(64)}`;

describe("dish photo addresses", () => {
  it("are on the Dan cloud, under the shop", () => {
    expect(photoUrl(photo, "thumb", "https://cloud.dan.partners", "goldendragon.dan.partners")).toBe(`https://cloud.dan.partners/shops/goldendragon.dan.partners/${photo}/thumb.jpg`);
  });

  it("are none for anything but a photo path", () => {
    expect(photoUrl(null, "large", "https://x.dan.partners", "x")).toBeNull();
    expect(photoUrl("javascript:alert(1)", "large", "https://x.dan.partners", "x")).toBeNull();
    expect(photoUrl(`${photo}/../../x`, "large", "https://x.dan.partners", "x")).toBeNull();
    expect(photoUrl(photo, "large", null, "goldendragon")).toBeNull();
    expect(photoUrl(photo, "large", "https://cloud.dan.partners", null)).toBeNull();
  });
});

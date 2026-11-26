import { describe, expect, it } from "vitest";
import { photoUrl } from "./api";

const photo = `images/${"c".repeat(64)}`;

describe("dish photo addresses", () => {
  it("are at the shop's API address", () => {
    expect(photoUrl(photo, "thumb", "https://goldendragon.dan.partners")).toBe(`https://goldendragon.dan.partners/${photo}/thumb.jpg`);
  });

  it("are none for anything but a photo path", () => {
    expect(photoUrl(null, "large", "https://x.dan.partners")).toBeNull();
    expect(photoUrl("javascript:alert(1)", "large", "https://x.dan.partners")).toBeNull();
    expect(photoUrl(`${photo}/../../x`, "large", "https://x.dan.partners")).toBeNull();
    expect(photoUrl(photo, "large", null)).toBeNull();
  });
});

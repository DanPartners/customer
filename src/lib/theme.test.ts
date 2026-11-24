// Copied from the dashboard's theme tests, so both apps are held to the same rules.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BRAND,
  CONTRAST,
  DEFAULT_THEME,
  PRESET_IDS,
  PRESETS,
  THEME_BOOT_SCRIPT,
  TYPEFACE_IDS,
  contrast,
  ensureContrast,
  isHex,
  normalizeSpec,
  normalizeTheme,
  resolveTheme,
  serializeResolved,
  specOf,
} from "./theme";

describe("the default theme", () => {
  it("is the brand: ivory paper, near-black ink, vermilion", () => {
    const { page, scheme, adjusted } = resolveTheme(PRESETS.dan);
    expect(page.paper).toBe(BRAND.ivory);
    expect(page.ink).toBe(BRAND.ink);
    expect(page.accent).toBe(BRAND.vermilion);
    expect(page["accent-ink"]).toBe(BRAND.vermilion);
    expect(page["on-accent"]).toBe(BRAND.white);
    expect(scheme).toBe("light");
    expect(adjusted).toEqual({ ink: false, accent: false });
  });

  it("matches the fallback values in globals.css, so nothing shifts when scripts load", () => {
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    for (const [name, value] of Object.entries(resolveTheme(PRESETS.dan).vars)) {
      expect(root, name).toContain(`${name}: ${value};`);
    }
  });
});

describe("every preset", () => {
  it.each(PRESET_IDS)("%s is readable on the page and in the side menu", (id) => {
    const resolved = resolveTheme(PRESETS[id]);
    expect(contrast(resolved.page.ink, resolved.page.paper)).toBeGreaterThanOrEqual(CONTRAST.body);
    for (const area of [resolved.page, resolved.chrome]) {
      // A side menu on a mid-tone such as vermilion cannot reach 7:1 with any colour, so AA is the floor there.
      expect(contrast(area.ink, area.paper)).toBeGreaterThanOrEqual(CONTRAST.soft);
      expect(contrast(area["ink-soft"], area.paper)).toBeGreaterThanOrEqual(CONTRAST.soft);
      expect(contrast(area["accent-ink"], area.paper)).toBeGreaterThanOrEqual(CONTRAST.accentText);
      expect(contrast(area.accent, area.paper)).toBeGreaterThanOrEqual(CONTRAST.fill);
      expect(contrast(area["on-accent"], area.accent)).toBeGreaterThanOrEqual(CONTRAST.soft);
    }
  });

  it("only emits hex colours", () => {
    for (const id of PRESET_IDS) {
      for (const value of Object.values(resolveTheme(PRESETS[id]).vars)) {
        expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
      }
    }
  });

  it("the ink preset is a dark scheme", () => {
    expect(resolveTheme(PRESETS.ink).scheme).toBe("dark");
  });

  it("the seal preset turns the side menu vermilion with white type", () => {
    const { chrome } = resolveTheme(PRESETS.seal);
    expect(chrome.paper).toBe(BRAND.vermilion);
    expect(chrome.ink).toBe(BRAND.white);
  });
});

describe("a custom theme", () => {
  it("moves text that would vanish into the background", () => {
    const resolved = resolveTheme({ paper: "#f5eedc", ink: "#f0e8d4", accent: "#f5eedc", chrome: "paper" });
    expect(resolved.adjusted).toEqual({ ink: true, accent: true });
    expect(contrast(resolved.page.ink, resolved.page.paper)).toBeGreaterThanOrEqual(CONTRAST.body);
    expect(contrast(resolved.page["accent-ink"], resolved.page.paper)).toBeGreaterThanOrEqual(CONTRAST.accentText);
    expect(contrast(resolved.page.accent, resolved.page.paper)).toBeGreaterThanOrEqual(CONTRAST.fill);
  });

  it("stays readable on a mid-grey, where neither pole is far away", () => {
    const { page } = resolveTheme({ paper: "#808080", ink: "#7a7a7a", accent: "#858585", chrome: "accent" });
    expect(contrast(page.ink, page.paper)).toBeGreaterThan(5);
  });

  it("puts dark type on a pale accent", () => {
    const { page } = resolveTheme({ paper: "#1b1916", ink: "#f5eedc", accent: "#ffd866", chrome: "paper" });
    expect(page["on-accent"]).toBe(BRAND.ink);
  });

  it("always finds AA text for the side menu, whatever the accent", () => {
    for (const accent of ["#777777", "#808080", "#ff0000", "#00a0a0", "#ffff00", "#3030ff", "#7a5cff"]) {
      const { chrome } = resolveTheme({ paper: "#f5eedc", ink: "#1b1916", accent, chrome: "accent" });
      expect(contrast(chrome.ink, chrome.paper), accent).toBeGreaterThanOrEqual(CONTRAST.soft);
      expect(contrast(chrome["ink-soft"], chrome.paper), accent).toBeGreaterThanOrEqual(CONTRAST.soft);
    }
  });

  it("leaves a readable colour alone", () => {
    expect(ensureContrast("#1b1916", "#f5eedc", 7)).toBe("#1b1916");
  });
});

describe("what storage is allowed to carry", () => {
  it("accepts six-digit hex and nothing else", () => {
    expect(isHex("#B83A2E")).toBe(true);
    for (const value of ["#fff", "red", "#b83a2e;background:url(//x)", "url(javascript:1)", "#b83a2e80", 12, null]) {
      expect(isHex(value)).toBe(false);
    }
  });

  it("replaces a tampered colour with the default", () => {
    const spec = normalizeSpec({ paper: "#000000;}body{display:none", ink: "#FFFFFF", accent: "expression(1)", chrome: "top" });
    expect(spec).toEqual({ paper: BRAND.ivory, ink: "#ffffff", accent: BRAND.vermilion, chrome: "paper" });
  });

  it("falls back to Dan for an unknown preset", () => {
    expect(normalizeTheme({ preset: "neon" }).preset).toBe("dan");
    expect(normalizeTheme("ink")).toEqual(DEFAULT_THEME);
    expect(specOf(normalizeTheme({ preset: "jade" }))).toEqual(PRESETS.jade);
  });

});

describe("typefaces", () => {
  it("default to Plex, including for a theme saved before typefaces existed", () => {
    expect(DEFAULT_THEME.typeface).toBe("plex");
    expect(normalizeTheme({ preset: "ink", custom: PRESETS.ink }).typeface).toBe("plex");
  });

  it("only accept a known id, so storage cannot name a font", () => {
    for (const typeface of ["comic", "plex; } body { display: none", "Plex", 3, null, ["plex"]]) {
      expect(normalizeTheme({ preset: "dan", typeface }).typeface).toBe("plex");
    }
    expect(normalizeTheme({ preset: "dan", typeface: "classic" }).typeface).toBe("classic");
  });

  it("each have a block of font stacks in globals.css", () => {
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
    for (const id of TYPEFACE_IDS) expect(css, id).toContain(`[data-typeface="${id}"] {`);
    expect(css.match(/\[data-typeface="[a-z]+"\]/g)).toHaveLength(TYPEFACE_IDS.length);
  });
});

describe("the script that paints before React loads", () => {
  function boot(stored: string | null) {
    const applied: Record<string, string> = {};
    const attributes: Record<string, string> = {};
    const style = {
      colorScheme: "",
      setProperty(name: string, value: string) {
        applied[name] = value;
      },
    };
    const documentElement = {
      style,
      setAttribute(name: string, value: string) {
        attributes[name] = value;
      },
    };
    const run = new Function("localStorage", "document", THEME_BOOT_SCRIPT);
    run({ getItem: () => stored }, { documentElement });
    return { applied, scheme: style.colorScheme, typeface: attributes["data-typeface"] };
  }

  it("applies a cached theme and typeface", () => {
    const resolved = resolveTheme(PRESETS.ink);
    const { applied, scheme, typeface } = boot(serializeResolved(resolved, "inter"));
    expect(applied).toEqual(resolved.vars);
    expect(scheme).toBe("dark");
    expect(typeface).toBe("inter");
  });

  it("ignores a typeface it does not know", () => {
    const resolved = resolveTheme(PRESETS.dan);
    for (const typeface of ['x"]{} body{display:none}', "toString", 0, ["plex"]]) {
      expect(boot(JSON.stringify({ scheme: "light", vars: resolved.vars, typeface })).typeface).toBeUndefined();
    }
  });

  it("ignores properties and values that are not theme colours", () => {
    const { applied, scheme } = boot(
      JSON.stringify({
        scheme: "dark; background: red",
        vars: {
          "--dan-paper": "#101010",
          "--dan-ink": "url(https://example.invalid/x)",
          "background-image": "#ffffff",
          "--dan-rule": "#ffffff3d",
          "--DAN-accent": "#ffffff",
        },
      }),
    );
    expect(applied).toEqual({ "--dan-paper": "#101010", "--dan-rule": "#ffffff3d" });
    expect(scheme).toBe("");
  });

  it("does nothing with an empty or broken cache", () => {
    expect(boot(null).applied).toEqual({});
    expect(boot("{not json").applied).toEqual({});
    expect(boot('"a string"').applied).toEqual({});
  });
});

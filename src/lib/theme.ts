// Shared with the dashboard (DanPartners/dashboard src/lib/theme.ts). Keep the two files identical,
// so a shop looks the same to its staff and its customers. A test checks the default theme values.

/**
 * Themes for the counter.
 *
 * A theme is three colours a person chooses (paper, ink, accent) and where the
 * side menu sits (on paper, on the accent, or on ink). Everything a component
 * paints with is derived from those here, so a custom theme cannot produce
 * unreadable text: derived colours are pushed apart until they meet a contrast
 * floor.
 *
 * A typeface is chosen separately and works with any colours.
 *
 * The brand mark is not part of a theme. The seal stays vermilion and the
 * word "Dan" stays in the brand serif.
 */

export const BRAND = {
  vermilion: "#b83a2e",
  ivory: "#f5eedc",
  ink: "#1b1916",
  white: "#ffffff",
} as const;

export const PRESET_IDS = ["dan", "seal", "ink", "jade", "porcelain", "contrast"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const CHROME_MODES = ["paper", "accent", "ink"] as const;
export type ChromeMode = (typeof CHROME_MODES)[number];

export type ThemeSpec = {
  paper: string;
  ink: string;
  accent: string;
  chrome: ChromeMode;
};

/**
 * Typefaces a person can pick. The font stacks live in globals.css under
 * [data-typeface]; only the id is stored, so storage never carries a font name.
 * `sample` is for drawing a typeface's own name in the picker.
 */
export const TYPEFACE_IDS = ["plex", "inter", "dm", "source", "classic"] as const;
export type TypefaceId = (typeof TYPEFACE_IDS)[number];

export const TYPEFACES: Record<TypefaceId, { name: string; sample: string; weight: number }> = {
  plex: { name: "Plex", sample: "var(--font-plex-sans), sans-serif", weight: 500 },
  inter: { name: "Inter", sample: "var(--font-inter), sans-serif", weight: 600 },
  dm: { name: "DM Sans", sample: "var(--font-dm-sans), sans-serif", weight: 500 },
  source: { name: "Source Serif", sample: "var(--font-source), serif", weight: 600 },
  classic: { name: "Bodoni", sample: "var(--font-bodoni), serif", weight: 500 },
};

export const DEFAULT_TYPEFACE: TypefaceId = "plex";

export type ThemeChoice = {
  preset: PresetId | "custom";
  custom: ThemeSpec;
  typeface: TypefaceId;
};

export const PRESETS: Record<PresetId, ThemeSpec> = {
  dan: { paper: BRAND.ivory, ink: BRAND.ink, accent: BRAND.vermilion, chrome: "paper" },
  seal: { paper: BRAND.ivory, ink: BRAND.ink, accent: BRAND.vermilion, chrome: "accent" },
  ink: { paper: BRAND.ink, ink: BRAND.ivory, accent: BRAND.vermilion, chrome: "paper" },
  jade: { paper: "#f2f0e3", ink: "#18201b", accent: "#2e6b4f", chrome: "paper" },
  porcelain: { paper: "#f6f7f4", ink: "#141c2b", accent: "#1f4e9b", chrome: "paper" },
  contrast: { paper: "#ffffff", ink: "#000000", accent: "#9e2a1f", chrome: "ink" },
};

export const DEFAULT_THEME: ThemeChoice = { preset: "dan", custom: PRESETS.dan, typeface: DEFAULT_TYPEFACE };

/**
 * Contrast floors, as WCAG ratios. Body text aims for 7:1 (AAA). Where the
 * background is a mid-tone, as a side menu on the accent is, no colour can
 * reach that, and the text settles on the best there is: never below 4.5:1 (AA).
 */
export const CONTRAST = { body: 7, soft: 4.5, accentText: 4.5, fill: 3 } as const;

const HEX = /^#[0-9a-f]{6}$/i;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && (PRESET_IDS as readonly string[]).includes(value);
}

export function isTypefaceId(value: unknown): value is TypefaceId {
  return typeof value === "string" && (TYPEFACE_IDS as readonly string[]).includes(value);
}

function isChromeMode(value: unknown): value is ChromeMode {
  return typeof value === "string" && (CHROME_MODES as readonly string[]).includes(value);
}

/** Anything that is not a strict six-digit hex falls back, so storage cannot carry CSS. */
export function normalizeSpec(value: unknown, fallback: ThemeSpec = PRESETS.dan): ThemeSpec {
  const record = value && typeof value === "object" ? (value as Partial<ThemeSpec>) : {};
  return {
    paper: isHex(record.paper) ? record.paper.toLowerCase() : fallback.paper,
    ink: isHex(record.ink) ? record.ink.toLowerCase() : fallback.ink,
    accent: isHex(record.accent) ? record.accent.toLowerCase() : fallback.accent,
    chrome: isChromeMode(record.chrome) ? record.chrome : fallback.chrome,
  };
}

export function normalizeTheme(value: unknown): ThemeChoice {
  if (!value || typeof value !== "object") return DEFAULT_THEME;
  const record = value as Partial<ThemeChoice>;
  return {
    preset: record.preset === "custom" || isPresetId(record.preset) ? record.preset : "dan",
    custom: normalizeSpec(record.custom),
    typeface: isTypefaceId(record.typeface) ? record.typeface : DEFAULT_TYPEFACE,
  };
}

export function specOf(choice: ThemeChoice): ThemeSpec {
  return choice.preset === "custom" ? choice.custom : PRESETS[choice.preset];
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear blend in sRGB. `amount` is how much of `b`. */
export function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  return toHex([ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount]);
}

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const unit = channel / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Returns `foreground` if it already clears `floor` against `background`.
 * Otherwise walks it towards black or white, whichever gets there, and returns
 * the first step that clears the floor (or the best available).
 */
export function ensureContrast(foreground: string, background: string, floor: number): string {
  if (contrast(foreground, background) >= floor) return foreground;
  const towards = (pole: string) => {
    for (let step = 1; step <= 25; step += 1) {
      const candidate = mix(foreground, pole, step / 25);
      if (contrast(candidate, background) >= floor) return candidate;
    }
    return pole;
  };
  const dark = towards("#000000");
  const light = towards("#ffffff");
  const darkOk = contrast(dark, background) >= floor;
  const lightOk = contrast(light, background) >= floor;
  if (darkOk && lightOk) {
    // Stay on the side the colour was already leaning to.
    return luminance(foreground) <= luminance(background) ? dark : light;
  }
  if (darkOk) return dark;
  if (lightOk) return light;
  return contrast(dark, background) >= contrast(light, background) ? dark : light;
}

export const SURFACE_KEYS = [
  "paper",
  "paper-raised",
  "paper-deep",
  "ink",
  "ink-soft",
  "accent",
  "accent-deep",
  "accent-ink",
  "on-accent",
  "rule",
] as const;
export type SurfaceKey = (typeof SURFACE_KEYS)[number];
export type Surface = Record<SurfaceKey, string>;

function alpha(hex: string, opacity: number): string {
  return `${hex}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;
}

/** Every colour a component may paint with, for one background. */
export function surface(paper: string, wantedInk: string, wantedAccent: string): Surface {
  const dark = luminance(paper) < 0.2;
  const ink = ensureContrast(wantedInk, paper, CONTRAST.body);
  const accent = ensureContrast(wantedAccent, paper, CONTRAST.fill);
  const onWhite = contrast(BRAND.white, accent);
  const onInk = contrast(BRAND.ink, accent);
  return {
    paper,
    "paper-raised": dark ? mix(paper, ink, 0.06) : mix(paper, BRAND.white, 0.5),
    "paper-deep": mix(paper, ink, 0.1),
    ink,
    "ink-soft": ensureContrast(mix(ink, paper, 0.34), paper, CONTRAST.soft),
    accent,
    "accent-deep": luminance(accent) < 0.03 ? mix(accent, BRAND.white, 0.22) : mix(accent, "#000000", 0.22),
    "accent-ink": ensureContrast(accent, paper, CONTRAST.accentText),
    // White on the accent, as on the icon, unless white would be hard to read.
    "on-accent": onWhite >= CONTRAST.soft || onWhite >= onInk ? BRAND.white : BRAND.ink,
    rule: alpha(ink, dark ? 0.24 : 0.16),
  };
}

export type ResolvedTheme = {
  scheme: "light" | "dark";
  /** CSS custom properties, ready for `style.setProperty`. Values are hex only. */
  vars: Record<string, string>;
  page: Surface;
  chrome: Surface;
  /** True where a chosen colour had to be moved to stay readable. */
  adjusted: { ink: boolean; accent: boolean };
};

export function resolveTheme(input: ThemeSpec): ResolvedTheme {
  const spec = normalizeSpec(input);
  const page = surface(spec.paper, spec.ink, spec.accent);
  const chrome =
    spec.chrome === "accent"
      ? surface(page.accent, page["on-accent"], page["on-accent"])
      : spec.chrome === "ink"
        ? surface(page.ink, page.paper, page.accent)
        : page;
  const vars: Record<string, string> = {};
  for (const key of SURFACE_KEYS) {
    vars[`--dan-${key}`] = page[key];
    vars[`--dan-chrome-${key}`] = chrome[key];
  }
  return {
    scheme: luminance(page.paper) < 0.2 ? "dark" : "light",
    vars,
    page,
    chrome,
    adjusted: { ink: page.ink !== spec.ink, accent: page["accent-ink"] !== spec.accent },
  };
}

/**
 * The last resolved theme is cached under this key so the page can paint in it
 * before React loads. The cache is only ever a copy; `dan.v1` is the truth.
 */
export const THEME_CACHE_KEY = "dan.theme";

export function serializeResolved(resolved: ResolvedTheme, typeface: TypefaceId = DEFAULT_TYPEFACE): string {
  return JSON.stringify({ scheme: resolved.scheme, vars: resolved.vars, typeface });
}

/**
 * Runs in <head> before first paint. It trusts nothing in storage: a property
 * is applied only if its name is a `--dan-` token and its value is a hex colour,
 * and a typeface only if it is one of the known ids.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var c=JSON.parse(localStorage.getItem(${JSON.stringify(
  THEME_CACHE_KEY,
)})||"null");if(!c||typeof c.vars!=="object"||!c.vars)return;var s=document.documentElement.style;for(var k in c.vars){var v=c.vars[k];if(/^--dan-[a-z-]+$/.test(k)&&typeof v==="string"&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v))s.setProperty(k,v)}if(c.scheme==="dark"||c.scheme==="light")s.colorScheme=c.scheme;if(${JSON.stringify(
  TYPEFACE_IDS,
)}.indexOf(c.typeface)>=0)document.documentElement.setAttribute("data-typeface",c.typeface)}catch(e){}})()`;

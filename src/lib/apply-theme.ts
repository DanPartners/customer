import { THEME_CACHE_KEY, resolveTheme, serializeResolved, specOf, type ThemeChoice } from "./theme";

/**
 * Paints the shop's theme on <html>, the same way the dashboard does, and
 * keeps a copy so the next visit paints in it before the shop answers.
 */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  const resolved = resolveTheme(specOf(choice));
  for (const [name, value] of Object.entries(resolved.vars)) root.style.setProperty(name, value);
  root.style.colorScheme = resolved.scheme;
  root.dataset.theme = choice.preset;
  root.dataset.typeface = choice.typeface;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved.chrome.paper);
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, serializeResolved(resolved, choice.typeface));
  } catch {
    // Private mode. The theme still applies for this visit.
  }
}

/** The colours Stripe's card form should use, so it matches the shop. */
export function stripeAppearance(choice: ThemeChoice) {
  const { page, scheme } = resolveTheme(specOf(choice));
  return {
    theme: scheme === "dark" ? ("night" as const) : ("stripe" as const),
    variables: {
      colorPrimary: page.accent,
      colorBackground: page["paper-raised"],
      colorText: page.ink,
      colorTextSecondary: page["ink-soft"],
      colorDanger: page["accent-ink"],
      borderRadius: "0px",
    },
  };
}

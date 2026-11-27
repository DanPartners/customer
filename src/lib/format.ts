const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function formatPence(pence: number): string {
  return gbp.format(pence / 100);
}

/** The name in the reader's language, or the only name there is. */
export function primaryName(nameEn: string, nameZh: string, locale: string) {
  return (locale === "zh-Hant" ? nameZh : nameEn) || nameEn || nameZh;
}

/** The name in the other language. Empty when there is only one name. */
export function secondaryName(nameEn: string, nameZh: string, locale: string) {
  if (nameEn === nameZh || !nameEn || !nameZh) return "";
  return locale === "zh-Hant" ? nameEn : nameZh;
}

export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "zh-Hant" ? "zh-Hant-HK" : "en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** An amount that may take off: "£1.20", "-£2.00". */
export function signedPence(pence: number): string {
  return pence < 0 ? `-${formatPence(-pence)}` : formatPence(pence);
}

/** A price change as a menu shows it: "+£1.50", "-£0.50", and nothing for no change. */
export function plusPence(pence: number): string {
  return pence === 0 ? "" : pence < 0 ? `-${formatPence(-pence)}` : `+${formatPence(pence)}`;
}

/** An add-on's own amount, before it is applied: "+10%", "-£1.00". `value` is pence, or hundredths of a percent. */
export function amountLabel(addon: { kind: "fixed" | "percent"; value: number }): string {
  const sign = addon.value < 0 ? "-" : "+";
  return addon.kind === "percent" ? `${sign}${Number((Math.abs(addon.value) / 100).toFixed(2))}%` : `${sign}${formatPence(Math.abs(addon.value))}`;
}

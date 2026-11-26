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

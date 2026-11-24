const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function formatPence(pence: number): string {
  return gbp.format(pence / 100);
}

export function primaryName(nameEn: string, nameZh: string, locale: string) {
  return locale === "zh-Hant" ? nameZh : nameEn;
}

export function secondaryName(nameEn: string, nameZh: string, locale: string) {
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

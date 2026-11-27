"use client";

import Link from "next/link";
import { useEffect } from "react";
import { primaryName, secondaryName } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { errorKey } from "@/lib/i18n";
import { adoptTableFromAddress, setTable, useTable } from "@/lib/table";
import { retryShop, useShop } from "@/lib/use-shop";
import { offerFor, orderingOf } from "@/lib/ordering";
import type { Menu, Shop } from "@/lib/types";
import { DanMark } from "./mark";
import { Button, Notice } from "./ui";

/**
 * The page around every screen: the shop's name and contact details on its
 * own surface (the theme's "chrome", so Seal makes it vermilion), a language
 * switch, and a quiet credit at the foot.
 */
export function ShopFrame({ children }: { children: (shop: Shop, menu: Menu) => React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const state = useShop();
  const table = useTable();
  const offer = state.status === "ready" ? offerFor(orderingOf(state.shop), table) : null;
  const ordering = !offer
    ? t("collectionOnly")
    : !offer.open
      ? t("orderingClosed")
      : offer.ways.includes("eat_in")
        ? `${t("eatInAt")} ${table}`
        : offer.ways.includes("delivery")
          ? t(offer.ways.includes("collection") ? "collectionOrDelivery" : "deliveryOnly")
          : t("collectionOnly");

  // A table's QR link (`/?table=3`) says where the customer is sitting.
  useEffect(() => adoptTableFromAddress(window.location.search), []);

  useEffect(() => {
    if (state.status === "ready") document.title = `${state.shop.name} · ${ordering}`;
    document.documentElement.lang = locale === "zh-Hant" ? "zh-Hant" : "en";
  }, [state, locale, ordering]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-paper focus:px-3 focus:py-2">
        {t("skip")}
      </a>
      <header className="chrome border-b border-rule bg-paper text-ink">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-4 px-4 py-4">
          <Link href="/" className="min-w-0">
            {state.status === "ready" ? (
              <>
                <p className="font-display text-3xl leading-none">{primaryName(state.shop.name, state.shop.nameZh, locale)}</p>
                <p className="mt-1 font-zh text-accent-ink">{secondaryName(state.shop.name, state.shop.nameZh, locale)}</p>
              </>
            ) : (
              <p className="font-display text-3xl leading-none">&nbsp;</p>
            )}
          </Link>
          <div className="grid shrink-0 grid-cols-2 border border-rule" role="group" aria-label="Language">
            <button
              type="button"
              aria-pressed={locale === "en"}
              className={`min-h-11 cursor-pointer px-3 font-display text-sm ${locale === "en" ? "bg-ink text-paper" : "text-ink-soft"}`}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
            <button
              type="button"
              aria-pressed={locale === "zh-Hant"}
              className={`min-h-11 cursor-pointer px-3 font-zh text-sm ${locale === "zh-Hant" ? "bg-ink text-paper" : "text-ink-soft"}`}
              onClick={() => setLocale("zh-Hant")}
            >
              中文
            </button>
          </div>
        </div>
        {state.status === "ready" ? (
          <div className="mx-auto flex max-w-3xl flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pb-3 text-sm text-ink-soft">
            <span className="font-display tracking-[0.14em] text-ink uppercase" data-testid="ordering-for">
              {ordering}
            </span>
            <span>
              {[state.shop.address, state.shop.city].filter(Boolean).join(", ")}
            </span>
            <a className="text-accent-ink underline" href={`tel:${state.shop.phone.replace(/\s/g, "")}`}>
              {state.shop.phone}
            </a>
            {table && offer?.ways.includes("eat_in") && (offer.ways.length > 1 || orderingOf(state.shop).collection) ? (
              <button type="button" className="min-h-11 cursor-pointer text-accent-ink underline" onClick={() => setTable(null)} data-testid="not-at-table">
                {t("notAtTable")}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {state.status === "loading" ? <p className="text-ink-soft">{t("loading")}</p> : null}
        {state.status === "error" ? (
          <div className="space-y-4" role="alert" data-testid="shop-error">
            <p className="text-lg">{t(errorKey(state.code))}</p>
            {state.code !== "not_configured" && state.code !== "no_shop" ? (
              <Button variant="line" onClick={retryShop}>
                {t("retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {offer && !offer.open ? (
          <div className="mb-5" data-testid="not-ordering" data-reason={offer.reason}>
            <Notice tone="alert">{t(offer.reason === "table_off" ? "tableOff" : offer.reason === "table_only" ? "tableOnly" : "notTakingOrders")}</Notice>
          </div>
        ) : null}
        {offer?.open && offer.reason === "table_off" ? (
          <div className="mb-5 space-y-2" data-testid="table-off">
            <Notice>
              {t("tableOff")} {t("tableOffCollection")}
            </Notice>
            <Button variant="line" onClick={() => setTable(null)}>
              {t("collectionOnly")}
            </Button>
          </div>
        ) : null}
        {state.status === "ready" ? children(state.shop, state.menu) : null}
      </main>

      <footer className="border-t border-rule">
        <p className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4 text-sm text-ink-soft">
          <DanMark size={20} />
          {t("poweredBy")} <span className="font-wordmark text-base text-ink">Dan</span>
        </p>
      </footer>
    </div>
  );
}

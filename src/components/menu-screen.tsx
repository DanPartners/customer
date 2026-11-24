"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { add, count, lines, MAX_QTY, total } from "@/lib/basket";
import { formatPence, primaryName, secondaryName } from "@/lib/format";
import { ALLERGEN_KEY, useI18n } from "@/lib/i18n";
import { useLocal, writeLocal } from "@/lib/storage";
import type { Menu, MenuItem } from "@/lib/types";
import { ShopFrame } from "./shop-frame";

export function MenuScreen() {
  return <ShopFrame>{(_, menu) => <MenuList menu={menu} />}</ShopFrame>;
}

function MenuList({ menu }: { menu: Menu }) {
  const { t, locale } = useI18n();
  const { basket } = useLocal();
  const categories = useMemo(() => [...menu.categories].sort((a, b) => a.sort - b.sort), [menu.categories]);
  const [active, setActive] = useState<string | null>(null);
  const current = active ?? categories[0]?.id ?? null;
  const visible = menu.items.filter((item) => item.categoryId === current).sort((a, b) => a.number - b.number);
  const inBasket = lines(basket, menu.items);

  return (
    <div className="pb-28">
      <h1 className="sr-only">{t("menu")}</h1>
      <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label={t("menu")}>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-pressed={category.id === current}
            onClick={() => setActive(category.id)}
            className={`min-h-11 shrink-0 cursor-pointer border px-3 ${category.id === current ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:bg-paper-deep"}`}
          >
            <span className="font-display">{primaryName(category.nameEn, category.nameZh, locale)}</span>
            <span className="ml-2 font-zh text-sm">{secondaryName(category.nameEn, category.nameZh, locale)}</span>
          </button>
        ))}
      </nav>

      <ul className="divide-y divide-rule border-y border-rule">
        {visible.map((item) => (
          <Dish key={item.id} item={item} menu={menu} qty={basket[item.number] ?? 0} />
        ))}
      </ul>

      {inBasket.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto max-w-3xl px-4 py-3">
            <Link
              href="/checkout"
              data-testid="basket-bar"
              className="flex min-h-14 items-center justify-between gap-3 bg-accent px-4 text-on-accent hover:bg-accent-deep"
            >
              <span className="font-display text-lg">
                {t("basketView")} · {count(inBasket)} {t("items")}
              </span>
              <span className="font-display text-xl">{formatPence(total(inBasket))}</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Dish({ item, menu, qty }: { item: MenuItem; menu: Menu; qty: number }) {
  const { t, locale } = useI18n();
  const { basket } = useLocal();
  const parts = item.includes
    .map((include) => menu.items.find((entry) => entry.number === include.number))
    .filter((part): part is MenuItem => Boolean(part));
  const label = `${item.number} ${primaryName(item.nameEn, item.nameZh, locale)}`;
  return (
    <li className={`py-4 ${item.soldOut ? "opacity-60" : ""}`} data-testid={`dish-${item.number}`}>
      <div className="flex items-start gap-3">
        <span className="w-10 shrink-0 font-display text-xl text-accent-ink">{item.number}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className={`text-lg leading-snug ${item.soldOut ? "line-through" : ""}`}>{primaryName(item.nameEn, item.nameZh, locale)}</span>
          </p>
          <p className="font-zh text-ink-soft">{secondaryName(item.nameEn, item.nameZh, locale)}</p>
          {item.descriptionEn ? <p className="mt-1 text-sm text-ink-soft">{item.descriptionEn}</p> : null}
          {parts.length ? (
            <p className="mt-1 text-sm text-ink-soft">
              {t("setIncludes")}: {parts.map((part) => primaryName(part.nameEn, part.nameZh, locale)).join(", ")}
            </p>
          ) : null}
          <p className="mt-1 text-xs tracking-wide text-ink-soft uppercase" data-testid={`allergens-${item.number}`}>
            {item.allergens.length ? `${t("allergens")}: ${item.allergens.map((a) => t(ALLERGEN_KEY[a])).join(" · ")}` : t("noAllergens")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="font-display text-lg">{formatPence(item.pricePence)}</span>
          {item.soldOut ? (
            <span className="font-display text-sm tracking-[0.14em] text-accent-ink uppercase">{t("soldOut")}</span>
          ) : qty > 0 ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`${t("remove")}: ${label}`}
                className="min-h-11 min-w-11 cursor-pointer border border-rule font-display text-lg"
                onClick={() => writeLocal({ basket: add(basket, item.number, -1) })}
              >
                −
              </button>
              <span className="w-7 text-center font-display" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                aria-label={`${t("add")}: ${label}`}
                disabled={qty >= MAX_QTY}
                className="min-h-11 min-w-11 cursor-pointer border border-rule font-display text-lg disabled:opacity-40"
                onClick={() => writeLocal({ basket: add(basket, item.number) })}
              >
                +
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label={`${t("add")}: ${label}`}
              className="min-h-11 cursor-pointer bg-ink px-4 font-display text-paper"
              onClick={() => writeLocal({ basket: add(basket, item.number) })}
            >
              {t("add")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

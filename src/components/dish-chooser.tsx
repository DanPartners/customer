"use client";

import { useEffect, useRef, useState } from "react";
import { firstChoices, MAX_QTY } from "@/lib/basket";
import { amountLabel, formatPence, plusPence, primaryName, secondaryName } from "@/lib/format";
import { ALLERGEN_KEY, useI18n } from "@/lib/i18n";
import type { Addon, MenuItem } from "@/lib/types";
import { Button } from "./ui";

/**
 * How a dish is taken: one of each "choose one" group, any of each "choose
 * any" group, and the shop's add-ons for a dish. A choice says what it adds
 * to the price and the allergens it brings, before it is chosen. A required
 * add-on is shown as included: the shop always applies it.
 *
 * The price shown is one of the dish with its choices. What the add-ons come
 * to, and the bill, are worked out by the shop at the checkout.
 */
export function DishChooser({
  item,
  dishAddons,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  /** The shop's add-ons for a dish, for online orders. */
  dishAddons: Addon[];
  onAdd: (choice: { options: string[]; addons: string[]; qty: number }) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<string[]>(() => firstChoices(item));
  // The ones the shop ticks to begin with. A required one is not the customer's to tick.
  const [addons, setAddons] = useState<string[]>(() => dishAddons.filter((addon) => addon.auto && !addon.required).map((addon) => addon.id));
  const [qty, setQty] = useState(1);
  const groups = item.options ?? [];

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const pick = (groupId: string, choiceId: string, one: boolean) => {
    const group = groups.find((entry) => entry.id === groupId);
    if (!group) return;
    const others = options.filter((id) => !group.choices.some((choice) => choice.id === id));
    if (one) return setOptions([...others, choiceId]);
    setOptions(options.includes(choiceId) ? options.filter((id) => id !== choiceId) : [...options, choiceId]);
  };
  const unit = item.pricePence + groups.flatMap((group) => group.choices).reduce((sum, choice) => sum + (options.includes(choice.id) ? choice.pricePence : 0), 0);
  const name = primaryName(item.nameEn, item.nameZh, locale);
  const row = "flex min-h-12 cursor-pointer items-center gap-3 py-2";

  return (
    <dialog
      ref={dialog}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100%-2rem))] overflow-y-auto border border-rule bg-paper p-0 text-ink backdrop:bg-black/60"
      aria-label={`${item.number} ${name}`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
      data-testid="dish-chooser"
    >
      <form
        method="dialog"
        className="space-y-5 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd({ options, addons, qty });
          dialog.current?.close();
        }}
      >
        <div>
          <h2 className="font-display text-2xl leading-tight">
            <span className="text-accent-ink">{item.number}</span> {name}
          </h2>
          <p className="font-zh text-ink-soft">{secondaryName(item.nameEn, item.nameZh, locale)}</p>
        </div>
        {groups.map((group) => (
          <fieldset key={group.id} data-testid={`group-${group.id}`}>
            <legend className="font-display text-lg">
              {primaryName(group.nameEn, group.nameZh, locale)}
              <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(group.nameEn, group.nameZh, locale)}</span>
              <span className="ml-2 font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t(group.kind === "one" ? "chooseOne" : "chooseAny")}</span>
            </legend>
            <div className="mt-1 divide-y divide-rule border-y border-rule">
              {group.choices.map((choice) => (
                <label key={choice.id} className={row}>
                  <input
                    type={group.kind === "one" ? "radio" : "checkbox"}
                    name={`${item.id}-${group.id}`}
                    className="size-5 shrink-0"
                    checked={options.includes(choice.id)}
                    onChange={() => pick(group.id, choice.id, group.kind === "one")}
                    data-testid={`choice-${choice.id}`}
                  />
                  <span className="min-w-0 flex-1">
                    {primaryName(choice.nameEn, choice.nameZh, locale)}
                    <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(choice.nameEn, choice.nameZh, locale)}</span>
                    {/* Said before it is chosen: a choice can bring an allergen the dish does not have. */}
                    {choice.allergens.length > 0 ? (
                      <span className="block text-xs tracking-wide text-ink-soft uppercase" data-testid={`choice-allergens-${choice.id}`}>
                        {t("allergens")}: {choice.allergens.map((allergen) => t(ALLERGEN_KEY[allergen])).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-display">{plusPence(choice.pricePence)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {dishAddons.length > 0 ? (
          <fieldset data-testid="chooser-addons">
            <legend className="font-display text-lg">{t("addOns")}</legend>
            <div className="mt-1 divide-y divide-rule border-y border-rule">
              {dishAddons.map((addon) => (
                <label key={addon.id} className={`${row} ${addon.required ? "cursor-default" : ""}`}>
                  <input
                    type="checkbox"
                    className="size-5 shrink-0"
                    checked={addon.required || addons.includes(addon.id)}
                    disabled={addon.required}
                    onChange={() => setAddons(addons.includes(addon.id) ? addons.filter((id) => id !== addon.id) : [...addons, addon.id])}
                    data-testid={`addon-${addon.id}`}
                  />
                  <span className="min-w-0 flex-1">
                    {primaryName(addon.nameEn, addon.nameZh, locale)}
                    <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(addon.nameEn, addon.nameZh, locale)}</span>
                    {addon.required ? <span className="block text-sm text-ink-soft">{t("included")}</span> : null}
                  </span>
                  <span className="shrink-0 font-display">{amountLabel(addon)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t("howMany")}</span>
          <span className="flex items-center gap-1">
            <button type="button" aria-label={t("remove")} className="min-h-11 min-w-11 cursor-pointer border border-rule font-display text-lg" onClick={() => setQty(Math.max(1, qty - 1))}>
              −
            </button>
            <span className="w-8 text-center font-display text-xl" aria-live="polite" data-testid="chooser-qty">
              {qty}
            </span>
            <button type="button" aria-label={t("add")} disabled={qty >= MAX_QTY} className="min-h-11 min-w-11 cursor-pointer border border-rule font-display text-lg disabled:opacity-40" onClick={() => setQty(Math.min(MAX_QTY, qty + 1))}>
              +
            </button>
          </span>
        </div>
        <p className="flex items-baseline justify-between">
          <span className="text-ink-soft">{t("each")}</span>
          <span className="font-display text-2xl" data-testid="chooser-price">
            {formatPence(unit)}
          </span>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => dialog.current?.close()}>
            {t("cancelChoice")}
          </Button>
          <Button type="submit" variant="accent" className="flex-1" data-testid="chooser-add">
            {t("addToOrder")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

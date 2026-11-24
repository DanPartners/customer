"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, placeOrder } from "@/lib/api";
import { add, allergensIn, lines, MAX_ORDER_PENCE, total } from "@/lib/basket";
import { formatPence, primaryName, secondaryName } from "@/lib/format";
import { ALLERGEN_KEY, errorKey, useI18n } from "@/lib/i18n";
import { useLocal, writeLocal } from "@/lib/storage";
import { useTable } from "@/lib/table";
import type { Menu, PayWith, Shop } from "@/lib/types";
import { reloadShop } from "@/lib/use-shop";
import { ShopFrame } from "./shop-frame";
import { Button, Field, Kicker, Notice } from "./ui";

export function CheckoutScreen() {
  return <ShopFrame>{(shop, menu) => <Checkout shop={shop} menu={menu} />}</ShopFrame>;
}

function Checkout({ shop, menu }: { shop: Shop; menu: Menu }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { basket } = useLocal();
  const table = useTable();
  const order = lines(basket, menu.items);
  const allergens = allergensIn(order, menu.items);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [payWith, setPayWith] = useState<PayWith>(shop.payments.card ? "card" : "at_shop");
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; confirm?: string; submit?: string }>({});
  const [busy, setBusy] = useState(false);

  if (order.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl">{t("yourOrder")}</h1>
        <p className="text-ink-soft">{t("basketEmpty")}</p>
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-accent-ink underline">
          {t("backToMenu")}
        </Link>
      </div>
    );
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = t("needName");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) next.phone = t("needPhone");
    if (!confirmed) next.confirm = t("needConfirm");
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const placed = await placeOrder({
        customerName: name.trim(),
        phone: phone.trim(),
        notes: notes.trim(),
        lines: order.map((line) => ({ number: line.item.number, qty: line.qty })),
        payWith,
        allergensConfirmed: true,
        table,
      });
      writeLocal({ basket: {} });
      router.push(`/order/${placed.token}`);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "error";
      // A dish sold out after the menu loaded: show the menu as it is now.
      if (code === "sold_out" || code === "unknown_item") void reloadShop();
      setErrors({ submit: t(errorKey(code)) });
      setBusy(false);
    }
  }

  const sum = total(order);
  return (
    <form onSubmit={send} className="space-y-8 pb-10" noValidate>
      <section>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-accent-ink underline">
          {t("backToMenu")}
        </Link>
        <h1 className="mt-2 border-b-[3px] border-ink pb-3 font-display text-3xl leading-none">{t("yourOrder")}</h1>
        <ul className="mt-3 divide-y divide-rule border-b border-rule" data-testid="checkout-lines">
          {order.map(({ item, qty, totalPence }) => (
            <li key={item.number} className="py-3">
              <div className="flex items-baseline gap-3">
                <span className="w-10 shrink-0 font-display text-lg text-accent-ink">{item.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{primaryName(item.nameEn, item.nameZh, locale)}</span>
                  <span className="font-zh text-sm text-ink-soft">{secondaryName(item.nameEn, item.nameZh, locale)}</span>
                </span>
                <span className="shrink-0 text-right font-display">{formatPence(totalPence)}</span>
              </div>
              <span className="mt-2 flex items-center justify-end gap-1">
                <button type="button" aria-label={`${t("remove")}: ${item.number}`} className="min-h-11 min-w-11 cursor-pointer border border-rule" onClick={() => writeLocal({ basket: add(basket, item.number, -1) })}>
                  −
                </button>
                <span className="w-7 text-center font-display">{qty}</span>
                <button type="button" aria-label={`${t("add")}: ${item.number}`} className="min-h-11 min-w-11 cursor-pointer border border-rule" onClick={() => writeLocal({ basket: add(basket, item.number) })}>
                  +
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between">
          <Kicker>{t("total")}</Kicker>
          <span className="font-display text-3xl" data-testid="checkout-total">
            {formatPence(sum)}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">{t("totalNote")}</p>
        {table ? (
          <div className="mt-3" data-testid="checkout-table">
            <Notice>
              {t("bringToTable")} <strong className="font-display">{table}</strong>
            </Notice>
          </div>
        ) : null}
        {sum > MAX_ORDER_PENCE ? <div className="mt-3"><Notice tone="alert">{t("errTooLarge")}</Notice></div> : null}
      </section>

      <section className="border border-rule bg-paper-raised p-4" data-testid="allergen-check">
        <h2 className="font-display text-xl">{t("allergenCheckTitle")}</h2>
        {allergens.length ? (
          <p className="mt-2 text-lg">{allergens.map((allergen) => t(ALLERGEN_KEY[allergen])).join(" · ")}</p>
        ) : (
          <p className="mt-2 text-ink-soft">{t("allergenCheckNone")}</p>
        )}
        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 size-5" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} data-testid="allergen-confirm" />
          <span>{t("allergenConfirm")}</span>
        </label>
        {errors.confirm ? <p className="mt-1 text-sm text-accent-ink" role="alert">{errors.confirm}</p> : null}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl">{t("yourDetails")}</h2>
        <Field id="name" label={t("name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} error={errors.name} />
        <Field id="phone" label={t("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" maxLength={25} hint={t("phoneHint")} error={errors.phone} />
        <Field id="notes" label={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
      </section>

      <fieldset className="space-y-2">
        <legend className="font-display text-xl">{t("payWith")}</legend>
        {shop.payments.card ? (
          <PayOption value="card" current={payWith} onChange={setPayWith} title={t("payCard")} hint={t("payCardHint")} />
        ) : null}
        <PayOption value="at_shop" current={payWith} onChange={setPayWith} title={table ? t("payAtCounter") : t("payAtShop")} hint={table ? t("payAtCounterHint") : t("payAtShopHint")} />
      </fieldset>

      {errors.submit ? <Notice tone="alert">{errors.submit}</Notice> : null}
      <Button type="submit" variant="accent" className="w-full" disabled={busy || sum > MAX_ORDER_PENCE} data-testid="send-order">
        {busy ? t("sending") : payWith === "card" ? t("continueToPay") : t("send")}
      </Button>
    </form>
  );
}

function PayOption({
  value,
  current,
  onChange,
  title,
  hint,
}: {
  value: PayWith;
  current: PayWith;
  onChange: (value: PayWith) => void;
  title: string;
  hint: string;
}) {
  return (
    <label className={`flex min-h-14 cursor-pointer items-start gap-3 border p-3 ${current === value ? "border-ink bg-paper-raised" : "border-rule"}`}>
      <input type="radio" name="pay" className="mt-1 size-5" checked={current === value} onChange={() => onChange(value)} data-testid={`pay-${value}`} />
      <span>
        <span className="block font-display text-lg">{title}</span>
        <span className="text-sm text-ink-soft">{hint}</span>
      </span>
    </label>
  );
}

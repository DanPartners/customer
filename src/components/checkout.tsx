"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, deliveryQuote, placeOrder } from "@/lib/api";
import { add, allergensIn, lines, MAX_ORDER_PENCE, total } from "@/lib/basket";
import { formatPence, primaryName, secondaryName } from "@/lib/format";
import { ALLERGEN_KEY, errorKey, useI18n } from "@/lib/i18n";
import { useLocal, writeLocal } from "@/lib/storage";
import { useTable } from "@/lib/table";
import { deliveryFeeFor, offerFor, orderingOf, payWaysFor, postcodeLooksRight, type Way } from "@/lib/ordering";
import type { DeliveryQuote, Menu, PayWith, Shop } from "@/lib/types";
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
  const ordering = orderingOf(shop);
  const offer = offerFor(ordering, table);
  const [chosenWay, setWay] = useState<Way | null>(null);
  const way: Way | null = offer.open && offer.reason !== "table_off" ? (chosenWay && offer.ways.includes(chosenWay) ? chosenWay : offer.ways[0]) : null;
  const payWays = way ? payWaysFor(ordering, way) : [];
  const [chosenPay, setPayWith] = useState<PayWith | null>(null);
  const payWith: PayWith | null = chosenPay && payWays.includes(chosenPay) ? chosenPay : (payWays[0] ?? null);
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  /** An Uber quote, for the address it was asked for. */
  const [quote, setQuote] = useState<{ for: string; quote: DeliveryQuote } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; confirm?: string; address?: string; postcode?: string; quote?: string; submit?: string }>({});
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

  const quoted = way === "delivery" && Boolean(ordering.deliveryQuoted);
  const addressKey = `${address.trim()}|${postcode.replace(/\s+/g, "").toUpperCase()}`;
  const currentQuote = quoted && quote?.for === addressKey ? quote.quote : null;

  /** Asks Uber, through the shop, what a courier to this address costs. */
  async function getQuote() {
    const next: typeof errors = {};
    if (!address.trim()) next.address = t("needAddress");
    if (!postcodeLooksRight(postcode)) next.postcode = t("needPostcode");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) next.phone = t("needPhone");
    setErrors(next);
    if (Object.keys(next).length) return;
    setQuoting(true);
    try {
      const got = await deliveryQuote({
        address: address.trim(),
        postcode: postcode.trim(),
        phone: phone.trim(),
        lines: order.map((line) => ({ number: line.item.number, qty: line.qty })),
      });
      setQuote({ for: addressKey, quote: got });
    } catch (error) {
      setErrors({ quote: t(errorKey(error instanceof ApiError ? error.code : "error")) });
    } finally {
      setQuoting(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = t("needName");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) next.phone = t("needPhone");
    if (!confirmed) next.confirm = t("needConfirm");
    if (way === "delivery") {
      if (!address.trim()) next.address = t("needAddress");
      if (!postcodeLooksRight(postcode)) next.postcode = t("needPostcode");
      if (quoted && !currentQuote) next.quote = t("needQuote");
    }
    setErrors(next);
    if (Object.keys(next).length || !way || !payWith) return;
    setBusy(true);
    try {
      const placed = await placeOrder({
        customerName: name.trim(),
        phone: phone.trim(),
        notes: notes.trim(),
        lines: order.map((line) => ({ number: line.item.number, qty: line.qty })),
        payWith,
        allergensConfirmed: true,
        table: way === "eat_in" ? table : null,
        fulfilment: way === "delivery" ? "delivery" : "collection",
        ...(way === "delivery" ? { address: address.trim(), postcode: postcode.trim() } : {}),
        ...(currentQuote ? { deliveryQuote: currentQuote.token } : {}),
      });
      writeLocal({ basket: {} });
      router.push(`/order/${placed.token}`);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "error";
      // A dish sold out after the menu loaded: show the menu as it is now.
      if (code === "sold_out" || code === "unknown_item") void reloadShop();
      if (code === "quote_expired") setQuote(null);
      setErrors({ submit: t(errorKey(code)) });
      setBusy(false);
    }
  }

  const food = total(order);
  const fee = way === "delivery" ? (deliveryFeeFor(ordering, currentQuote?.feePence ?? null, food) ?? 0) : 0;
  const minimum = way === "delivery" ? (ordering.deliveryMinimumPence ?? 0) : 0;
  const sum = food + fee;
  const belowMinimum = food < minimum;
  if (!way) {
    // The shop frame already says why (not taking orders, or a table link to switch).
    return null;
  }
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
        {fee ? (
          <div className="mt-3 flex items-baseline justify-between text-ink-soft" data-testid="checkout-fee">
            <span>{t("deliveryFee")}</span>
            <span className="font-display">{formatPence(fee)}</span>
          </div>
        ) : null}
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
        {belowMinimum ? (
          <div className="mt-3" data-testid="below-minimum">
            <Notice tone="alert">
              {t("minimumOrder")} {formatPence(minimum)}
            </Notice>
          </div>
        ) : null}
      </section>

      {offer.ways.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="font-display text-xl">{t("howToGet")}</legend>
          {offer.ways.map((option) => (
            <Choice
              key={option}
              name="way"
              testId={`way-${option}`}
              checked={way === option}
              onChange={() => setWay(option)}
              title={t(option === "delivery" ? "wayDelivery" : "wayCollection")}
              hint={
                option !== "delivery"
                  ? t("wayCollectionHint")
                  : ordering.deliveryQuoted
                    ? `${t("wayUberHint")} ${t("minimumOrder")} ${formatPence(ordering.deliveryMinimumPence ?? 0)}${ordering.deliveryFreeOverPence != null ? ` · ${t("freeDeliveryOver")} ${formatPence(ordering.deliveryFreeOverPence)}` : ""}`
                    : `${t("wayDeliveryHint")} ${t("deliveryFee")} ${formatPence(ordering.deliveryFeePence ?? 0)} · ${t("minimumOrder")} ${formatPence(ordering.deliveryMinimumPence ?? 0)}`
              }
            />
          ))}
        </fieldset>
      ) : null}

      {way === "delivery" ? (
        <section className="space-y-4" data-testid="delivery-address">
          <h2 className="font-display text-xl">{t("deliveryAddress")}</h2>
          <Field id="address" label={t("deliveryAddress")} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" maxLength={120} error={errors.address} />
          <Field id="postcode" label={t("postcode")} value={postcode} onChange={(e) => setPostcode(e.target.value)} autoComplete="postal-code" maxLength={10} error={errors.postcode} />
          {quoted ? (
            <div className="space-y-2" data-testid="delivery-quote">
              {currentQuote ? (
                <p>
                  {t("deliveryFee")} <strong className="font-display" data-testid="quote-fee">{formatPence(fee)}</strong>{" "}
                  <span className="text-sm text-ink-soft">{t("quoteHeld")}</span>
                </p>
              ) : (
                <p className="text-sm text-ink-soft">{t("wayUberHint")}</p>
              )}
              <Button type="button" variant="line" disabled={quoting} onClick={() => void getQuote()} data-testid="get-quote">
                {quoting ? t("sending") : t("getQuote")}
              </Button>
              {errors.quote ? <Notice tone="alert">{errors.quote}</Notice> : null}
            </div>
          ) : null}
        </section>
      ) : null}

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
        {payWays.includes("card") ? (
          <PayOption value="card" current={payWith} onChange={setPayWith} title={t("payCard")} hint={t("payCardHint")} />
        ) : null}
        {payWays.includes("at_shop") ? (
          <PayOption
            value="at_shop"
            current={payWith}
            onChange={setPayWith}
            title={way === "delivery" ? t("payCashOnDelivery") : way === "eat_in" ? t("payAtCounter") : t("payAtShop")}
            hint={way === "delivery" ? t("payCashOnDeliveryHint") : way === "eat_in" ? t("payAtCounterHint") : t("payAtShopHint")}
          />
        ) : null}
        {payWays.includes("bank_transfer") ? (
          <PayOption value="bank_transfer" current={payWith} onChange={setPayWith} title={t("payBank")} hint={t("payBankHint")} />
        ) : null}
      </fieldset>

      {errors.submit ? <Notice tone="alert">{errors.submit}</Notice> : null}
      <Button type="submit" variant="accent" className="w-full" disabled={busy || sum > MAX_ORDER_PENCE || belowMinimum || !payWith || (quoted && !currentQuote)} data-testid="send-order">
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
  current: PayWith | null;
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

function Choice({ name, testId, checked, onChange, title, hint }: { name: string; testId: string; checked: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label className={`flex min-h-14 cursor-pointer items-start gap-3 border p-3 ${checked ? "border-ink bg-paper-raised" : "border-rule"}`}>
      <input type="radio" name={name} className="mt-1 size-5" checked={checked} onChange={onChange} data-testid={testId} />
      <span>
        <span className="block font-display text-lg">{title}</span>
        <span className="text-sm text-ink-soft">{hint}</span>
      </span>
    </label>
  );
}

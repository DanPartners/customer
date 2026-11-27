"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, deliveryQuote, placeOrder, quote as askQuote } from "@/lib/api";
import { add, allergensIn, lines, MAX_ORDER_PENCE, orderLines, total } from "@/lib/basket";
import { amountLabel, formatPence, primaryName, secondaryName, signedPence } from "@/lib/format";
import { ALLERGEN_KEY, errorKey, useI18n } from "@/lib/i18n";
import { useLocal, writeLocal } from "@/lib/storage";
import { useTable } from "@/lib/table";
import { deliveryFeeFor, offerFor, orderingOf, payWaysFor, postcodeLooksRight, type Way } from "@/lib/ordering";
import type { DeliveryQuote, Menu, OrderLineInput, PayWith, Quote, Shop } from "@/lib/types";
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
  const order = useMemo(() => lines(basket, menu.items, menu.addons), [basket, menu.items, menu.addons]);
  const allergens = allergensIn(order, menu.items);
  // The shop's add-ons for the whole bill. One that is not required is the customer's to tick.
  const billAddons = useMemo(() => menu.addons.filter((addon) => addon.scope === "bill"), [menu.addons]);
  const [billTicked, setBillTicked] = useState<string[] | null>(null);
  const billIds = useMemo(
    () => billAddons.filter((addon) => !addon.required && (billTicked ? billTicked.includes(addon.id) : addon.auto)).map((addon) => addon.id),
    [billAddons, billTicked],
  );
  // A shop with options or add-ons is told exactly how each dish is taken; any other gets a dish and how many.
  const explicit = menu.addons.length > 0 || menu.items.some((item) => (item.options?.length ?? 0) > 0);
  const wanted = useMemo(() => orderLines(order, explicit), [order, explicit]);
  // Where the shop has add-ons, the shop works the bill out. Asked again whenever the order changes.
  const quoteKey = menu.addons.length > 0 && wanted.length > 0 ? JSON.stringify({ lines: wanted, addons: billIds }) : "";
  const [answer, setAnswer] = useState<{ key: string; quote: Quote | null; code: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!quoteKey) return;
    let stale = false;
    // A moment's wait, so three quick taps on "+" ask once.
    const timer = window.setTimeout(() => {
      askQuote(JSON.parse(quoteKey) as { lines: OrderLineInput[]; addons: string[] }).then(
        (got) => {
          if (!stale) setAnswer({ key: quoteKey, quote: got, code: null });
        },
        (error: unknown) => {
          if (stale) return;
          const code = error instanceof ApiError ? error.code : "error";
          // The menu has changed under the order: show it as it is now.
          if (["sold_out", "unknown_item", "bad_options", "bad_addon"].includes(code)) void reloadShop();
          setAnswer({ key: quoteKey, quote: null, code });
        },
      );
    }, 250);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [quoteKey, attempt]);
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
        lines: wanted,
        ...(billAddons.length > 0 ? { addons: billIds } : {}),
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
        lines: wanted,
        ...(billAddons.length > 0 ? { addons: billIds } : {}),
        payWith,
        allergensConfirmed: true,
        table: way === "eat_in" ? table : null,
        fulfilment: way === "delivery" ? "delivery" : "collection",
        ...(way === "delivery" ? { address: address.trim(), postcode: postcode.trim() } : {}),
        ...(currentQuote ? { deliveryQuote: currentQuote.token } : {}),
      });
      writeLocal({ basket: [] });
      router.push(`/order/${placed.token}`);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "error";
      // A dish sold out after the menu loaded: show the menu as it is now.
      if (["sold_out", "unknown_item", "bad_options", "bad_addon"].includes(code)) void reloadShop();
      if (code === "quote_expired") setQuote(null);
      setErrors({ submit: t(errorKey(code)) });
      setBusy(false);
    }
  }

  // The shop's own figures where it has add-ons; otherwise the dishes with their choices, which is the whole bill.
  const priced = quoteKey ? (answer?.key === quoteKey ? answer.quote : null) : null;
  const priceFailed = quoteKey && answer?.key === quoteKey && !answer.quote ? (answer.code ?? "error") : null;
  const known = quoteKey ? priced !== null : true;
  const food = quoteKey ? (priced?.totalPence ?? 0) : total(order);
  const fee = way === "delivery" ? (deliveryFeeFor(ordering, currentQuote?.feePence ?? null, food) ?? 0) : 0;
  const minimum = way === "delivery" ? (ordering.deliveryMinimumPence ?? 0) : 0;
  const sum = food + fee;
  const belowMinimum = known && food < minimum;
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
          {order.map((line, at) => {
            const { item, qty, entry } = line;
            // The shop's line, where it has priced the order: the add-ons on the dish are its to say.
            const shops = priced?.lines[at];
            const onDish = shops?.addons ?? [];
            return (
              <li key={line.key} className="py-3" data-testid="checkout-line">
                <div className="flex items-baseline gap-3">
                  <span className="w-10 shrink-0 font-display text-lg text-accent-ink">{item.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{primaryName(item.nameEn, item.nameZh, locale)}</span>
                    <span className="font-zh text-sm text-ink-soft">{secondaryName(item.nameEn, item.nameZh, locale)}</span>
                    {line.choices.length > 0 ? (
                      <span className="block text-sm text-ink-soft" data-testid="line-choices">
                        {line.choices.map((choice) => primaryName(choice.nameEn, choice.nameZh, locale)).join(" · ")}
                      </span>
                    ) : null}
                    {(shops ? onDish : line.addons).map((addon) => (
                      <span key={addon.id} className="block text-sm text-ink-soft" data-testid="line-addon">
                        + {primaryName(addon.nameEn, addon.nameZh, locale)} {"amountPence" in addon ? signedPence(addon.amountPence) : amountLabel(addon)}
                      </span>
                    ))}
                  </span>
                  <span className="shrink-0 text-right font-display" data-testid="line-total">
                    {quoteKey ? (shops?.totalPence != null ? formatPence(shops.totalPence) : "…") : formatPence(line.unitPence * qty)}
                  </span>
                </div>
                <span className="mt-2 flex items-center justify-end gap-1">
                  <button type="button" aria-label={`${t("remove")}: ${item.number}`} className="min-h-11 min-w-11 cursor-pointer border border-rule" onClick={() => writeLocal({ basket: add(basket, entry, -1) })}>
                    −
                  </button>
                  <span className="w-7 text-center font-display">{qty}</span>
                  <button type="button" aria-label={`${t("add")}: ${item.number}`} className="min-h-11 min-w-11 cursor-pointer border border-rule" onClick={() => writeLocal({ basket: add(basket, entry) })}>
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        {billAddons.length > 0 ? (
          <fieldset className="mt-3 divide-y divide-rule border-b border-rule" data-testid="checkout-addons">
            <legend className="sr-only">{t("addOns")}</legend>
            {billAddons.map((addon) => {
              const applied = priced?.addons.find((entry) => entry.id === addon.id);
              const ticked = addon.required || billIds.includes(addon.id);
              return (
                <label key={addon.id} className={`flex min-h-12 items-center gap-3 py-2 ${addon.required ? "" : "cursor-pointer"}`}>
                  {/* A required add-on is a line of the bill, not a choice. */}
                  {addon.required ? null : (
                    <input
                      type="checkbox"
                      className="size-5 shrink-0"
                      checked={ticked}
                      onChange={() => setBillTicked(ticked ? billIds.filter((id) => id !== addon.id) : [...billIds, addon.id])}
                      data-testid={`bill-addon-${addon.id}`}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    {primaryName(addon.nameEn, addon.nameZh, locale)}
                    <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(addon.nameEn, addon.nameZh, locale)}</span>
                    <span className="ml-2 text-sm text-ink-soft">{amountLabel(addon)}</span>
                  </span>
                  <span className="shrink-0 font-display" data-testid={`bill-addon-amount-${addon.id}`}>
                    {ticked ? (applied ? signedPence(applied.amountPence) : "…") : ""}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ) : null}
        {fee ? (
          <div className="mt-3 flex items-baseline justify-between text-ink-soft" data-testid="checkout-fee">
            <span>{t("deliveryFee")}</span>
            <span className="font-display">{formatPence(fee)}</span>
          </div>
        ) : null}
        <div className="mt-3 flex items-baseline justify-between">
          <Kicker>{t("total")}</Kicker>
          <span className="font-display text-3xl" data-testid="checkout-total" aria-live="polite">
            {known ? formatPence(sum) : "…"}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">{known || priceFailed ? t("totalNote") : t("priceWorking")}</p>
        {priceFailed ? (
          <div className="mt-3 space-y-2" data-testid="price-failed">
            <Notice tone="alert">{["sold_out", "unknown_item", "bad_options", "bad_addon", "rate_limited"].includes(priceFailed) ? t(errorKey(priceFailed)) : t("priceFailed")}</Notice>
            <Button type="button" variant="line" onClick={() => setAttempt((n) => n + 1)}>
              {t("retry")}
            </Button>
          </div>
        ) : null}
        {table ? (
          <div className="mt-3" data-testid="checkout-table">
            <Notice>
              {t("bringToTable")} <strong className="font-display">{table}</strong>
            </Notice>
          </div>
        ) : null}
        {known && sum > MAX_ORDER_PENCE ? <div className="mt-3"><Notice tone="alert">{t("errTooLarge")}</Notice></div> : null}
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
      <Button type="submit" variant="accent" className="w-full" disabled={busy || !known || sum > MAX_ORDER_PENCE || belowMinimum || !payWith || (quoted && !currentQuote)} data-testid="send-order">
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

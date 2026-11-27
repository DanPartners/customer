"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiBase, isToken, loadOrder, orderFields } from "@/lib/api";
import { formatPence, formatTime, primaryName, secondaryName, signedPence } from "@/lib/format";
import { errorKey, useI18n, type CopyKey } from "@/lib/i18n";
import { live, type LiveStatus } from "@/lib/live";
import type { PublicOrder, Shop } from "@/lib/types";
import { CardPayment } from "./card-payment";
import { ShopFrame } from "./shop-frame";
import { Kicker, Notice } from "./ui";

/** Asked when the page opens: by then the shop has loaded, so the fields are the ones its server knows. */
const orderLive = () => `subscription Order($token: String!) { order(token: $token) { ${orderFields()} } }`;

const STEPS: { status: PublicOrder["status"]; label: CopyKey }[] = [
  { status: "new", label: "stepReceived" },
  { status: "preparing", label: "stepPreparing" },
  { status: "ready", label: "stepReady" },
  { status: "completed", label: "stepCollected" },
];

/** An eat-in order is brought to the table, so its last two steps read differently. */
const TABLE_LABELS: Partial<Record<CopyKey, CopyKey>> = {
  stepReady: "stepOnItsWay",
  stepCollected: "stepServed",
  statusReady: "statusReadyTable",
  statusCompleted: "statusServed",
  payAtCollection: "payBeforeLeaving",
};

const STATUS_COPY: Record<PublicOrder["status"], CopyKey> = {
  awaiting_payment: "statusAwaiting",
  new: "statusNew",
  preparing: "statusPreparing",
  ready: "statusReady",
  completed: "statusCompleted",
  expired: "statusExpired",
  rejected: "statusRejected",
  cancelled: "statusCancelled",
};

/** A delivery is brought to the door, so its last steps read differently too. */
const DELIVERY_LABELS: Partial<Record<CopyKey, CopyKey>> = {
  stepReady: "stepOnItsWay",
  stepCollected: "stepDelivered",
  statusReady: "statusReadyDelivery",
  statusCompleted: "statusDelivered",
  payAtCollection: "payOnDelivery",
};

export function OrderStatusScreen() {
  return <ShopFrame>{(shop) => <OrderStatus shop={shop} />}</ShopFrame>;
}

/**
 * Follows one order live over the shop's WebSocket channel. The first message
 * is the order as it is now; each later one is a change. The channel ends by
 * itself once the order is collected.
 */
function OrderStatus({ shop }: { shop: Shop }) {
  const { t, locale } = useI18n();
  const params = useParams<{ token: string }>();
  const token = String(params.token ?? "");
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [problem, setProblem] = useState<string | null>(isToken(token) ? null : "not_found");
  const [connection, setConnection] = useState<LiveStatus>("connecting");

  useEffect(() => {
    const base = apiBase();
    if (!isToken(token) || !base) return;
    return live<{ order: PublicOrder }>({
      base,
      query: orderLive(),
      variables: { token },
      onData: ({ order: next }) => {
        setOrder(next);
        setProblem(null);
      },
      onStatus: setConnection,
      onRefused: (code) => setProblem(code),
    });
  }, [token]);

  if (problem) {
    return (
      <div className="space-y-4" data-testid="order-problem">
        <p className="text-lg">{t(errorKey(problem))}</p>
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-accent-ink underline">
          {t("orderAgain")}
        </Link>
      </div>
    );
  }
  if (!order) return <p className="text-ink-soft">{t("checking")}</p>;

  const step = STEPS.findIndex((entry) => entry.status === order.status);
  const atTable = order.fulfilment === "eat_in";
  const delivering = order.fulfilment === "delivery";
  const say = (key: CopyKey) => t((atTable && TABLE_LABELS[key]) || (delivering && DELIVERY_LABELS[key]) || key);
  return (
    <div className="space-y-6 pb-10" data-testid="order-status" data-status={order.status}>
      <header className="border-b-[3px] border-ink pb-3">
        <Kicker>{t("orderNumber")}</Kicker>
        <p className="font-display text-5xl leading-none" data-testid="order-number">
          {order.number != null ? `#${order.number}` : <span className="text-2xl text-ink-soft">{t("awaitingNumber")}</span>}
        </p>
        <p className="mt-2 text-lg" role="status" aria-live="polite" data-testid="order-message">
          {say(STATUS_COPY[order.status])}
        </p>
        {atTable && order.table ? (
          <p className="mt-1 font-display tracking-[0.14em] uppercase" data-testid="order-table">
            {t("eatInAt")} {order.table}
          </p>
        ) : null}
        {delivering ? (
          <div className="mt-1" data-testid="order-delivery">
            <p>
              {t("deliveringTo")} <span className="font-display">{order.address}</span>
            </p>
            {order.deliveryBy ? (
              <p className="text-sm text-ink-soft">{t(order.deliveryBy === "uber_direct" ? "deliveredByUber" : "deliveredByShop")}</p>
            ) : null}
          </div>
        ) : null}
        {connection === "offline" ? <p className="mt-1 text-sm text-ink-soft">{t("checking")}</p> : null}
      </header>

      {order.status === "awaiting_payment" && order.bankTransfer ? <BankTransfer details={order.bankTransfer} payBy={order.payBy} /> : null}

      {order.status === "cancelled" && order.payment.method === "card" && order.payment.status === "paid" ? (
        <Notice>
          <span data-testid="order-refund">{t(order.refund === "refunded" ? "refundRefunded" : order.refund === "failed" ? "refundFailed" : "refundPending")}</span>
        </Notice>
      ) : null}

      {delivering && order.status !== "cancelled" ? <Courier courier={order.courier ?? null} /> : null}

      {step >= 0 ? (
        <ol className="grid grid-cols-4 gap-1" aria-label={t("orderTitle")}>
          {STEPS.map((entry, index) => (
            <li
              key={entry.status}
              aria-current={index === step ? "step" : undefined}
              className={`border-t-[3px] pt-2 text-center text-sm leading-tight ${index <= step ? "border-accent text-ink" : "border-rule text-ink-soft"}`}
            >
              {say(entry.label)}
            </li>
          ))}
        </ol>
      ) : null}

      {order.status === "awaiting_payment" && order.clientSecret && shop.stripePublishableKey ? (
        <div className="space-y-2">
          {order.payBy ? (
            <p className="text-sm text-ink-soft">
              {t("payBy")} {formatTime(order.payBy, locale)}
            </p>
          ) : null}
          <CardPayment
            publishableKey={shop.stripePublishableKey}
            stripeAccount={shop.stripeAccount}
            clientSecret={order.clientSecret}
            theme={shop.theme}
            // Ask the shop server to check with Stripe now; the live channel then brings the result.
            onPaid={() => void loadOrder(token).then(setOrder).catch(() => undefined)}
          />
        </div>
      ) : null}

      <section>
        <ul className="divide-y divide-rule border-y border-rule">
          {order.lines.map((line, at) => (
            // The same dish taken two ways is two lines: its place in the order tells them apart.
            <li key={`${line.number}-${at}`} className="flex gap-3 py-2" data-testid="status-line">
              <span className="w-10 font-display text-accent-ink">{line.number}</span>
              <span className="min-w-0 flex-1">
                {primaryName(line.nameEn, line.nameZh, locale)}
                <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(line.nameEn, line.nameZh, locale)}</span>
                {(line.options?.length ?? 0) > 0 ? (
                  <span className="block text-sm text-ink-soft" data-testid="status-choices">
                    {line.options!.map((option) => primaryName(option.nameEn, option.nameZh, locale)).join(" · ")}
                  </span>
                ) : null}
                {(line.addons ?? []).map((addon) => (
                  <span key={addon.id} className="block text-sm text-ink-soft" data-testid="status-line-addon">
                    + {primaryName(addon.nameEn, addon.nameZh, locale)} {signedPence(addon.amountPence)}
                  </span>
                ))}
              </span>
              <span>×{line.qty}</span>
            </li>
          ))}
        </ul>
        {(order.addons ?? []).map((addon) => (
          <div key={addon.id} className="mt-2 flex items-baseline justify-between text-ink-soft" data-testid="status-addon">
            <span>{primaryName(addon.nameEn, addon.nameZh, locale)}</span>
            <span>{signedPence(addon.amountPence)}</span>
          </div>
        ))}
        {order.deliveryFeePence ? (
          <div className="mt-2 flex items-baseline justify-between text-ink-soft">
            <span>{t("deliveryFee")}</span>
            <span>{formatPence(order.deliveryFeePence)}</span>
          </div>
        ) : null}
        <div className="mt-3 flex items-baseline justify-between">
          <Kicker>{t("total")}</Kicker>
          <span className="font-display text-3xl">{formatPence(order.totalPence)}</span>
        </div>
        <p className="mt-1 text-sm" data-testid="order-payment">
          {order.payment.method === "at_shop"
            ? say("payAtCollection")
            : order.payment.status === "paid"
              ? t(order.payment.method === "bank_transfer" ? "paidByBank" : "paidByCard")
              : t("statusAwaiting")}
        </p>
      </section>

      {order.status === "expired" || order.status === "completed" || order.status === "rejected" || order.status === "cancelled" ? (
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-accent-ink underline">
          {t("orderAgain")}
        </Link>
      ) : (
        <Notice>{t("keepLink")}</Notice>
      )}
    </div>
  );
}

/**
 * How to pay an unpaid bank-transfer order: the shop's details, the amount
 * and the reference. Nothing here says it is paid: staff confirm that.
 */
function BankTransfer({ details, payBy }: { details: NonNullable<PublicOrder["bankTransfer"]>; payBy: string | null }) {
  const { t, locale } = useI18n();
  const rows: [CopyKey, string, string][] = [
    ["bankName", details.accountName, "bank-name"],
    ["bankSortCode", details.sortCode, "bank-sort-code"],
    ["bankAccount", details.accountNumber, "bank-account"],
    ["bankAmount", formatPence(details.amountPence), "bank-amount"],
  ];
  return (
    <section className="border border-rule border-l-[6px] border-l-accent bg-paper-raised p-4" data-testid="bank-transfer" aria-labelledby="bank-title">
      <h2 id="bank-title" className="font-display text-xl">
        {t("bankTitle")}
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        {rows.map(([label, value, id]) => (
          <div key={id} className="contents">
            <dt className="text-ink-soft">{t(label)}</dt>
            <dd className="font-display text-lg tabular-nums select-all" data-testid={id}>
              {value}
            </dd>
          </div>
        ))}
        <dt className="text-ink-soft">{t("bankReference")}</dt>
        <dd className="font-display text-2xl tracking-[0.08em] select-all" data-testid="bank-reference">
          {details.reference}
        </dd>
      </dl>
      <p className="mt-3 text-sm">{t("bankUseReference")}</p>
      <p className="mt-1 text-sm font-display">{t("bankNotConfirmed")}</p>
      {payBy ? (
        <p className="mt-1 text-sm text-ink-soft">
          {t("payBy")} {formatTime(payBy, locale)}
        </p>
      ) : null}
    </section>
  );
}

const COURIER_COPY: Partial<Record<string, CopyKey>> = {
  pending: "courierBooked",
  pickup: "courierToShop",
  pickup_complete: "courierWithFood",
  dropoff: "courierWithFood",
  delivered: "courierDelivered",
};

/** The Uber courier bringing the order: where it has got to, and Uber's live map. */
function Courier({ courier }: { courier: PublicOrder["courier"] }) {
  const { t, locale } = useI18n();
  const say = courier ? COURIER_COPY[courier.status] : undefined;
  if (!courier || !say) return null;
  const moving = courier.status !== "delivered";
  return (
    <section className="border border-rule bg-paper-raised p-4" data-testid="order-courier">
      <h2 className="font-display text-lg">{t("courierTitle")}</h2>
      <p className="mt-1" data-testid="courier-status">
        {t(say)}
        {moving && courier.dropoffEta ? ` ${t("courierArrives")} ${formatTime(courier.dropoffEta, locale)}.` : null}
      </p>
      {moving && courier.trackingUrl.startsWith("https://") ? (
        <a href={courier.trackingUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex min-h-11 items-center font-display text-accent-ink underline" data-testid="courier-track">
          {t("courierTrack")}
        </a>
      ) : null}
    </section>
  );
}

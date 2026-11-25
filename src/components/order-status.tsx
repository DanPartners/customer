"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiBase, isToken, loadOrder } from "@/lib/api";
import { formatPence, formatTime, primaryName, secondaryName } from "@/lib/format";
import { errorKey, useI18n, type CopyKey } from "@/lib/i18n";
import { live, type LiveStatus } from "@/lib/live";
import type { PublicOrder, Shop } from "@/lib/types";
import { CardPayment } from "./card-payment";
import { ShopFrame } from "./shop-frame";
import { Kicker, Notice } from "./ui";

const ORDER_LIVE =
  "subscription Order($token: String!) { order(token: $token) { number status createdAt customerName notes fulfilment table totalPence clientSecret payBy payment { method status } lines { number nameEn nameZh qty unitPricePence } } }";

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
      query: ORDER_LIVE,
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
  const say = (key: CopyKey) => t((atTable && TABLE_LABELS[key]) || key);
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
        {connection === "offline" ? <p className="mt-1 text-sm text-ink-soft">{t("checking")}</p> : null}
      </header>

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
          {order.lines.map((line) => (
            <li key={line.number} className="flex gap-3 py-2">
              <span className="w-10 font-display text-accent-ink">{line.number}</span>
              <span className="min-w-0 flex-1">
                {primaryName(line.nameEn, line.nameZh, locale)}
                <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(line.nameEn, line.nameZh, locale)}</span>
              </span>
              <span>×{line.qty}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between">
          <Kicker>{t("total")}</Kicker>
          <span className="font-display text-3xl">{formatPence(order.totalPence)}</span>
        </div>
        <p className="mt-1 text-sm" data-testid="order-payment">
          {order.payment.method === "card"
            ? order.payment.status === "paid"
              ? t("paidByCard")
              : t("statusAwaiting")
            : say("payAtCollection")}
        </p>
      </section>

      {order.status === "expired" || order.status === "completed" ? (
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-accent-ink underline">
          {t("orderAgain")}
        </Link>
      ) : (
        <Notice>{t("keepLink")}</Notice>
      )}
    </div>
  );
}

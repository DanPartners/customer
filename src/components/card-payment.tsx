"use client";

import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";
import { stripeAppearance } from "@/lib/apply-theme";
import { useI18n } from "@/lib/i18n";
import type { ThemeChoice } from "@/lib/theme";
import { Button, Notice } from "./ui";

/**
 * Stripe's own card form, in the shop's colours. Card details go from here
 * to Stripe; this site and the shop server never see them. When Stripe says
 * the payment went through, `onPaid` runs so the page can ask the shop server
 * to check with Stripe, rather than wait for Stripe's notification.
 */
export function CardPayment({
  publishableKey,
  clientSecret,
  theme,
  onPaid,
}: {
  publishableKey: string;
  clientSecret: string;
  theme: ThemeChoice;
  onPaid: () => void;
}) {
  const { t, locale } = useI18n();
  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<{ stripe: Stripe; elements: StripeElements } | null>(null);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadStripe(publishableKey).then((stripe) => {
      if (cancelled || !stripe || !mountRef.current) return;
      const elements = stripe.elements({ clientSecret, appearance: stripeAppearance(theme), locale: locale === "zh-Hant" ? "zh-HK" : "en-GB" });
      const element = elements.create("payment", { layout: "tabs" });
      element.on("ready", () => setReady(true));
      element.mount(mountRef.current);
      stripeRef.current = { stripe, elements };
    });
    return () => {
      cancelled = true;
    };
  }, [publishableKey, clientSecret, theme, locale]);

  async function pay() {
    const current = stripeRef.current;
    if (!current) return;
    setPaying(true);
    setFailed(null);
    const result = await current.stripe.confirmPayment({
      elements: current.elements,
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    if (result.error) {
      setFailed(result.error.message ?? t("paymentFailed"));
      setPaying(false);
      return;
    }
    onPaid();
  }

  return (
    <section className="space-y-3 border border-rule bg-paper-raised p-4" data-testid="card-payment">
      <div ref={mountRef} />
      {!ready ? <p className="text-sm text-ink-soft">{t("paymentLoading")}</p> : null}
      {failed ? <Notice tone="alert">{failed}</Notice> : null}
      <Button variant="accent" className="w-full" disabled={!ready || paying} onClick={() => void pay()} data-testid="pay-button">
        {paying ? t("paying") : t("payNow")}
      </Button>
    </section>
  );
}

import type { Metadata } from "next";
import { CheckoutScreen } from "@/components/checkout";

export const metadata: Metadata = { title: "Your order" };

export default function CheckoutPage() {
  return <CheckoutScreen />;
}

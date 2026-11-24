import type { Metadata } from "next";
import { OrderStatusScreen } from "@/components/order-status";

// A private link: never in search results.
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

export default function OrderPage() {
  return <OrderStatusScreen />;
}

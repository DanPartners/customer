import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Bodoni_Moda, DM_Sans, IBM_Plex_Sans, Inter, Source_Serif_4 } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// The shop's typeface comes from its theme. Plex is the default; the others load when a shop uses them.
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-plex-sans", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap", preload: false });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-source", display: "swap", preload: false });
const bodoni = Bodoni_Moda({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-bodoni", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Order for collection",
  description: "Order from the shop for collection.",
  referrer: "no-referrer",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F5EEDC",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Each request has its own nonce (see proxy.ts); the theme script needs it to run.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${inter.variable} ${dmSans.variable} ${sourceSerif.variable} ${bodoni.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Paints the shop's last-seen theme before first paint. Accepts only hex colours and known typefaces. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

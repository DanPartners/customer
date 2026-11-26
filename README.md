# Dan: customer ordering

The site a shop's customers order from. They open the shop's link (or scan its QR code), see the bilingual menu with allergens, order for collection (or, from a table's QR code, to eat in), pay by card or at the shop, and follow their order live until it is ready.

Each shop has its own copy of this site, at its own address, talking to that shop's [Dan server](https://github.com/DanPartners/server) through the server's **public API**. The counter side is the [dashboard](https://github.com/DanPartners/dashboard).

This repository is open source (MIT). It holds no secrets and needs none.

## Run

```bash
npm install
```

```bash
NEXT_PUBLIC_DAN_API_URL=http://127.0.0.1:2284 npm run dev
```

Open [http://localhost:3001](http://localhost:3001). The shop server must list `http://localhost:3001` in `DAN_PUBLIC_ORIGINS`, or it refuses the site.

```bash
npm test          # basket, API client, live channel, theme rules
npm run lint
npm run build
```

## Deploy

**In the Dan cloud (how shops run it).** The [Dan cloud](https://github.com/DanPartners/cloud)'s `compose.yaml` builds this repo, pinned to a tested commit, from the `Dockerfile` here (a standalone Next.js build on Node 22, non-root, port 3001). One copy serves every shop: each shop is at `https://<shop>.dan.partners`, where the cloud's front sends `/graphql`, its live channel and `/stripe/webhook` to that shop's customer API and everything else here. Without `NEXT_PUBLIC_DAN_API_URL` the site calls the API at its own address, so it always reaches the shop it was opened for.

**Somewhere else.** Build it with `NEXT_PUBLIC_DAN_API_URL` set to a shop's API address (for example `https://goldendragon.dan.partners`), and have the cloud accept this site's address (`DAN_SHOP_SITE`).

**Card payments** use Stripe Connect: the shop's API gives Dan's platform publishable key and the shop's connected account, and Stripe's card form opens on that account, so the money goes to the shop.

**Order numbers:** an order placed here reaches the shop's machine within seconds and gets its number there; the order page says "awaiting number" until then and updates live. If the shop's machine is down, the cloud numbers it from 9001 after 20 seconds.

## What a customer sees

| Screen | What it does |
| --- | --- |
| Menu | Categories, dishes in English and Chinese, prices, allergens on every dish, set meal contents. Sold-out dishes are shown but cannot be added. A dish with a photo shows it beside the price; tapped, it opens large. Photos come from the shop's own address (`/images/...`, served by the Dan cloud); none is shown if it cannot load. A bar at the foot shows the basket. |
| Checkout | The basket, editable. Every allergen in the order, including those inside set meals, and a box to confirm they have been checked (the server refuses an order without it). Name, phone, a note. Pay by card or at the shop. |
| Order | The private link. The order number, the stage (received, being cooked, ready to collect, collected), the dishes and total, and how it is paid. For a card order, Stripe's card form until it is paid. Updates arrive live. |

English or Traditional Chinese, switched in the header and remembered on the phone.

### Table links

A QR code on a table points at the site with the table's name: `https://order.yourshop.example/?table=3`. The header then says **Eat in · Table 3**, the order is sent as eat-in for that table, and the order page reads "on its way to your table" and "served" instead of "ready to collect" and "collected". Paying at the shop becomes "pay at the counter before you leave".

- A table name is up to 10 letters (any language), numbers, spaces or hyphens: `3`, `12A`, `Patio 2`, `窗邊-1`. Anything else in the link is ignored, and the shop server checks it again.
- The table is remembered for that browser tab only, so someone who scanned a table's code and later orders from home is not still "at table 3". The header has "Not at a table? Order for collection" to clear it.
- Anyone can type any table name into the address. The staff see it on the docket and can check with the customer, as they would at the counter.

## How it talks to the shop

- **Queries over HTTPS** to `<api>/graphql`: the shop, the menu, placing an order. The contract is the server's [`public.graphql`](https://github.com/DanPartners/server/blob/main/public.graphql); this side is [`src/lib/api.ts`](src/lib/api.ts).
- **Live over a WebSocket** at `<api>/graphql/ws` (`graphql-transport-ws`): the order page subscribes to its own order and gets each change as it happens. It reconnects by itself, and the subscription always starts with the order as it is now, so nothing is missed. [`src/lib/live.ts`](src/lib/live.ts) is the same client the dashboard uses.
- **Nothing polls.** The menu is loaded once per visit. If a dish sells out in the meantime, the server refuses the order with `sold_out` and the checkout reloads the menu.
- **Prices are the server's.** The site sends dish numbers and quantities. The totals it shows are for the customer's convenience; the server prices the order itself.

## Card payments

Card payment shows only when the shop has set up its own Stripe keys on its server. The server creates each payment for its own price and hands the page a one-time `clientSecret`. Stripe's card form ([`@stripe/stripe-js`](https://github.com/stripe/stripe-js), loaded from `js.stripe.com`) takes the card details, so they go to Stripe and never to this site or the shop. Once Stripe confirms, the order joins the counter's board and the page shows its number. A card order not paid within 30 minutes expires and nothing is charged.

## Theme

The shop's theme (colours and typeface) comes from its server and is set by the owner in the dashboard. Every component paints with the same colour roles as the dashboard (`bg-paper`, `text-ink`, `text-accent-ink`, `bg-accent`, …), and [`src/lib/theme.ts`](src/lib/theme.ts) is the dashboard's file, unchanged, so a shop looks the same to its staff and its customers, and text stays readable whatever colours the owner picks. The header is the theme's "chrome" surface, so the Seal theme puts it on vermilion. Stripe's card form gets the same colours. The last theme is remembered on the phone and painted before the page loads.

Chinese text uses the phone's own Chinese fonts. The site ships none, which keeps it light on mobile data.

## Security

- **No secrets.** The only key in the browser is Stripe's publishable key, which is meant to be public.
- **Strict Content Security Policy** with a fresh nonce on every request ([`src/proxy.ts`](src/proxy.ts)): only this site's scripts and Stripe's can run; connections go only to this site, the shop's API and Stripe; only Stripe may be framed; nobody may frame this site.
- **No referrer** is ever sent, so an order's private link cannot leak to another site. Order pages are kept out of search engines.
- **No cookies, no tracking, no analytics.** The phone keeps only the language and the basket.
- The shop server does the rest: it refuses sites not on its list, limits orders per address and phone, and never shows one customer another's order. See the server's README.

## Tests

`e2e/ordering.spec.ts` runs the site against a real shop server: security headers, the shop's theme, sold-out dishes, a pay-at-the-shop order followed live to collection, a table link's eat-in order followed until it is served, and a card order confirmed by a signed Stripe notification. It changes data, so never point it at a shop in service. Set the server up with `dan-server init --demo`, start `e2e/fake-stripe.mjs` and point the server's `DAN_STRIPE_API_BASE` at it, then:

```bash
DAN_E2E_STAFF_URL=http://127.0.0.1:2283 DAN_E2E_PUBLIC_URL=http://127.0.0.1:2284 \
DAN_E2E_OWNER_EMAIL=you@example.com DAN_E2E_OWNER_PASSWORD='…' \
DAN_E2E_FAKE_STRIPE_URL=http://127.0.0.1:12111 DAN_E2E_WEBHOOK_SECRET='…' npx playwright test
```

Without those variables the tests are skipped.

## Not built yet

- Delivery. Collection, and eat-in from a table's link, only.
- A way for the owner to pause online ordering on a busy night.
- Adding a stamp to the customer's card from an online order.

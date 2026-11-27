# Dan: customer ordering

The site a shop's customers order from. They open the shop's link (or scan its QR code), see the bilingual menu with allergens, order for collection (or, from a table's QR code, to eat in), pay by card or at the shop, and follow their order live until it is ready.

One copy of this site serves every shop, at each shop's own address (`https://<shop>.dan.partners`, or the shop's own domain). It talks to the [Dan cloud](https://github.com/DanPartners/cloud)'s one address, `https://cloud.dan.partners`, naming the shop it was opened for; that shop's own **public API** (the [Dan server](https://github.com/DanPartners/server)'s, which the cloud runs for each shop) answers (DAN-45). The counter side is the [dashboard](https://github.com/DanPartners/dashboard).

This repository is open source (MIT). It holds no secrets and needs none.

## Run

```bash
npm install
```

```bash
NEXT_PUBLIC_DAN_API_URL=http://localhost:2290 NEXT_PUBLIC_DAN_SHOP=goldendragon npm run dev
```

Open [http://localhost:3001](http://localhost:3001). `NEXT_PUBLIC_DAN_API_URL` is a Dan cloud (here one run locally); `NEXT_PUBLIC_DAN_SHOP` names the shop, by its address name, since `localhost` names none. The cloud must accept this site as the shop's own (`DAN_SHOP_SITE=http://localhost:3001`). A plain shop server works too (`NEXT_PUBLIC_DAN_API_URL=http://127.0.0.1:2284`, listing `http://localhost:3001` in its `DAN_PUBLIC_ORIGINS`); it ignores the shop's name, and has no dish photos.

```bash
npm test          # basket, API client, live channel, theme rules
npm run lint
npm run build
```

## Deploy

**On Vercel (how shops run it, DAN-45).** One Vercel project for every shop, with `NEXT_PUBLIC_DAN_API_URL=https://cloud.dan.partners` and nothing else. Its domains are `*.dan.partners` (every shop's address) and each shop's own domain; the site names its shop by the address it is visited at, and the cloud finds the shop by it (its address name, or a domain added with `dan-cloud shop domain-add`). Ryan creates the project, and the DNS and domains are in the cloud's DEPLOY.md, step 7. Nothing is set per shop.

**The `Dockerfile`** (a standalone Next.js build on Node 22, non-root, port 3001) is what the cloud's `compose.yaml` ran before DAN-45, one copy for every shop behind the cloud's front; it goes with the cloud's old routes in DAN-48. Built that way, it needs `NEXT_PUBLIC_DAN_API_URL` too.

**Card payments** use Stripe Connect: the shop's API gives Dan's platform publishable key and the shop's connected account, and Stripe's card form opens on that account, so the money goes to the shop.

**Order numbers:** an order placed here reaches the shop's machine within seconds and gets its number there; the order page says "awaiting number" until then and updates live. If the shop's machine is down, the cloud numbers it from 9001 after 20 seconds.

## What a customer sees

| Screen | What it does |
| --- | --- |
| Menu | Categories, dishes in English and Chinese, prices, allergens on every dish, set meal contents. Sold-out dishes are shown but cannot be added. A dish with options (a size, extras) says so and asks how it is taken before it is added: see [Options and add-ons](#options-and-add-ons). A dish with a photo shows it beside the price; tapped, it opens large. Photos come from the Dan cloud, under the shop (`/shops/<shop>/images/...`, DAN-45); none is shown if it cannot load. A bar at the foot shows the basket. |
| Checkout | The basket, editable: each line with what was chosen for it. The shop's add-ons for the bill, and the total. Every allergen in the order, including those inside set meals and those a chosen option brings, and a box to confirm they have been checked (the server refuses an order without it). Name, phone, a note. Pay by card or at the shop. |
| Order | The private link. The order number, the stage (received, being cooked, ready to collect, collected), the dishes with what was chosen, the add-ons on the bill, the total, and how it is paid. For a card order, Stripe's card form until it is paid. Updates arrive live. |

English or Traditional Chinese, switched in the header and remembered on the phone.

### What the shop offers

The site offers only what the owner switched on (the shop's `ordering`): collection, delivery (address and UK postcode, the shop's fee added, its minimum order checked), and eat-in from a table's link; and the ways to pay that are on: card, in person (at the counter, at the table, or cash to the shop's own driver), and bank transfer. The shop server refuses anything else, whatever the page sends.

- No online methods on: the menu can be browsed, with "This shop is not taking online orders right now" and no Add buttons.
- A table's link while table ordering is off: "This shop is not taking orders from tables right now", with "Order for collection" if collection is on; otherwise no order from that link.
- **Bank transfer:** the order page shows the shop's account name, sort code, account number, the amount and a reference to use, and says the order is not confirmed until the shop sees the money. It updates live when staff mark it paid, or says the transfer was not received. Unpaid for 30 minutes, it lapses.

### Options and add-ons

A shop's owner can give a dish **options** and the shop **add-ons** (in the dashboard). The site shows what the owner set, for online orders only.

- **Options** are groups of choices on a dish: "Size", "Extras". A group is choose one (the first is ticked to begin with) or choose any. Each choice says what it adds to the price and the allergens it brings, before it is chosen. Such a dish has a **Choose** button, which opens the choices, the add-ons for a dish, and how many. The same dish taken two ways is two lines of the order.
- **Add-ons** are named amounts: a service charge, a carrier bag, an offer. One for a dish is offered when the dish is chosen; one for the whole bill is at the checkout. The owner decides which are ticked to begin with and which are **required**. A required one cannot be unticked: on a dish it is shown ticked and "Included", on the bill it is simply a line.
- **The bill is the shop's.** Where a shop has add-ons, the checkout asks the shop server what the order comes to (`quote`) each time the order changes, and shows the server's own figures: each line, each add-on, the total. The site does not work add-ons out itself, so the menu's basket bar shows no figure for such a shop. Until the server has answered, the total reads "…" and the order cannot be sent; if it cannot answer, the page says so with **Try again**. Where a shop has no add-ons, the total is the dishes with their choices, added up here as before.
- **What is sent** is still only what was chosen: dish numbers, quantities, the ids of the choices and of the add-ons ticked. Never a price. The server prices the order again when it is placed, and a card is charged that.
- **If the menu changes under an order** (a choice removed, an add-on withdrawn), the line that no longer fits is left out of the basket rather than sent to be refused, and a refusal from the server (`bad_options`, `bad_addon`) reloads the menu.
- A basket saved in the browser before options (dish number to quantity) is still read.
- A shop with no options and no add-ons gets orders exactly as before, so a copy of this site pointed at an older shop server still works: it asks for the menu without the new fields when the server does not know them.

### Table links

A QR code on a table points at the site with the table's name: `https://order.yourshop.example/?table=3`. The header then says **Eat in · Table 3**, the order is sent as eat-in for that table, and the order page reads "on its way to your table" and "served" instead of "ready to collect" and "collected". Paying at the shop becomes "pay at the counter before you leave".

- A table name is up to 10 letters (any language), numbers, spaces or hyphens: `3`, `12A`, `Patio 2`, `窗邊-1`. Anything else in the link is ignored, and the shop server checks it again.
- The table is remembered for that browser tab only, so someone who scanned a table's code and later orders from home is not still "at table 3". The header has "Not at a table? Order for collection" to clear it.
- Anyone can type any table name into the address. The staff see it on the docket and can check with the customer, as they would at the counter.
- **A shop that has just joined.** With no dishes yet, the page says the menu is on its way. A shop or dish named in one language shows that name once, in either language; an address not yet filled in is left out.

## How it talks to the shop

- **Queries over HTTPS** to `<cloud>/graphql?shop=<this site's address>`: the shop, the menu with the shop's add-ons, what a basket comes to (`quote`), placing an order. The contract is the server's [`public.graphql`](https://github.com/DanPartners/server/blob/main/public.graphql); this side is [`src/lib/api.ts`](src/lib/api.ts).
- **Live over a WebSocket** at `<cloud>/graphql/ws?shop=<this site's address>` (`graphql-transport-ws`): the order page subscribes to its own order and gets each change as it happens. It reconnects by itself, and the subscription always starts with the order as it is now, so nothing is missed. [`src/lib/live.ts`](src/lib/live.ts) is the same client the dashboard uses.
- **Nothing polls.** The menu is loaded once per visit. If a dish sells out in the meantime, the server refuses the order with `sold_out` and the checkout reloads the menu.
- **Prices are the server's.** The site sends dish numbers, quantities and what was chosen. Where a shop has add-ons the totals shown are the server's own (`quote`); otherwise they are added up here for the customer's convenience. Either way the server prices the order itself when it is placed.

## Card payments

Card payment shows only when the shop has set up its own Stripe keys on its server. The server creates each payment for its own price and hands the page a one-time `clientSecret`. Stripe's card form ([`@stripe/stripe-js`](https://github.com/stripe/stripe-js), loaded from `js.stripe.com`) takes the card details, so they go to Stripe and never to this site or the shop. Once Stripe confirms, the order joins the counter's board and the page shows its number. A card order not paid within 30 minutes expires and nothing is charged.

## Theme

The shop's theme (colours and typeface) comes from its server and is set by the owner in the dashboard. Every component paints with the same colour roles as the dashboard (`bg-paper`, `text-ink`, `text-accent-ink`, `bg-accent`, …), and [`src/lib/theme.ts`](src/lib/theme.ts) is the dashboard's file, unchanged, so a shop looks the same to its staff and its customers, and text stays readable whatever colours the owner picks. The header is the theme's "chrome" surface, so the Seal theme puts it on vermilion. Stripe's card form gets the same colours. The last theme is remembered on the phone and painted before the page loads.

Chinese text uses the phone's own Chinese fonts. The site ships none, which keeps it light on mobile data.

## Security

- **No secrets.** The only key in the browser is Stripe's publishable key, which is meant to be public.
- **Strict Content Security Policy** with a fresh nonce on every request ([`src/proxy.ts`](src/proxy.ts)): only this site's scripts and Stripe's can run; connections go only to this site, the Dan cloud and Stripe; only Stripe may be framed; nobody may frame this site.
- **No referrer** is ever sent, so an order's private link cannot leak to another site. Order pages are kept out of search engines.
- **No cookies, no tracking, no analytics.** The phone keeps only the language and the basket.
- The shop's API does the rest: it refuses any site but the shop's own (its dan.partners address and its own domains), limits orders per address and phone, and never shows one customer another's order. See the server's README.

## Tests

`e2e/options.spec.ts` sets a dish's options and the shop's add-ons through the staff API, then orders as a customer and checks the order that reaches the counter is the bill the page showed, to the penny. `e2e/ordering.spec.ts` runs the site against a real shop server: security headers, the shop's theme, sold-out dishes, a pay-at-the-shop order followed live to collection, a table link's eat-in order followed until it is served, and a card order confirmed by a signed Stripe notification. It changes data, so never point it at a shop in service. Set the server up with `dan-server init --demo`, start `e2e/fake-stripe.mjs` and point the server's `DAN_STRIPE_API_BASE` at it, then:

```bash
DAN_E2E_STAFF_URL=http://127.0.0.1:2283 DAN_E2E_PUBLIC_URL=http://127.0.0.1:2284 \
DAN_E2E_OWNER_EMAIL=you@example.com DAN_E2E_OWNER_PASSWORD='…' \
DAN_E2E_FAKE_STRIPE_URL=http://127.0.0.1:12111 DAN_E2E_WEBHOOK_SECRET='…' npx playwright test
```

Without those variables the tests are skipped.

## Not built yet

- A way for the owner to pause online ordering on a busy night.
- Adding a stamp to the customer's card from an online order.

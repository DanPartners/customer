import { createHmac } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The customer site against a real Dan shop server.
 *
 * The site's API address is set when the dev server starts
 * (NEXT_PUBLIC_DAN_API_URL, see playwright.config.ts). The server must be set
 * up with `dan-server init --demo`, list http://localhost:3001 in
 * DAN_PUBLIC_ORIGINS, and, for the card test, use e2e/fake-stripe.mjs as its
 * Stripe (DAN_STRIPE_API_BASE). These tests change data on the server, so
 * never point them at a shop in service.
 *
 *   DAN_E2E_STAFF_URL=http://127.0.0.1:2283 DAN_E2E_PUBLIC_URL=http://127.0.0.1:2284 \
 *   DAN_E2E_OWNER_EMAIL=… DAN_E2E_OWNER_PASSWORD=… \
 *   DAN_E2E_FAKE_STRIPE_URL=http://127.0.0.1:12111 DAN_E2E_WEBHOOK_SECRET=… npx playwright test
 */
const staffUrl = process.env.DAN_E2E_STAFF_URL;
const publicUrl = process.env.DAN_E2E_PUBLIC_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const fakeStripe = process.env.DAN_E2E_FAKE_STRIPE_URL;
const webhookSecret = process.env.DAN_E2E_WEBHOOK_SECRET ?? "";

test.skip(!staffUrl || !publicUrl, "Set DAN_E2E_STAFF_URL and DAN_E2E_PUBLIC_URL to run against a real shop server.");

/** Does what the shop's staff would do, through the staff API. */
async function staff(request: APIRequestContext, query: string, variables: Record<string, unknown> = {}) {
  const login = await request.post(`${staffUrl}/graphql`, {
    data: { query: "mutation($i: LoginInput!) { login(input: $i) { token } }", variables: { i: { email: ownerEmail, password: ownerPassword } } },
  });
  const token = ((await login.json()) as { data: { login: { token: string } } }).data.login.token;
  const response = await request.post(`${staffUrl}/graphql`, { headers: { authorization: `Bearer ${token}` }, data: { query, variables } });
  const body = (await response.json()) as { data: Record<string, unknown>; errors?: unknown[] };
  expect(body.errors).toBeUndefined();
  return body.data;
}

async function freshMenu(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("dish-1")).toBeVisible();
}

async function checkout(page: Page, payWith: "card" | "at_shop", name: string) {
  await page.getByRole("button", { name: /^Add: 1 / }).click();
  await page.getByRole("button", { name: /Rice/ }).first().click();
  await page.getByRole("button", { name: /^Add: 81 / }).click();
  await page.getByRole("button", { name: /^Add: 81 / }).click();
  await expect(page.getByTestId("basket-bar")).toContainText("3 items");
  await page.getByTestId("basket-bar").click();
  await page.getByTestId(`pay-${payWith}`).check();
  await page.getByTestId("send-order").click();
  // The allergen check comes first.
  await expect(page.getByText("Tick the allergen check")).toBeVisible();
  await expect(page.getByTestId("allergen-check")).toContainText("Gluten");
  await page.getByTestId("allergen-confirm").check();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Phone number").fill(`07700 9${String(Date.now()).slice(-5)}`);
  await page.getByTestId("send-order").click();
  await expect(page.getByTestId("order-status")).toBeVisible();
}

test("every page carries strict security headers with a fresh nonce", async ({ request }) => {
  const first = await request.get("/");
  const second = await request.get("/");
  const policy = first.headers()["content-security-policy"];
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(policy).toContain(publicUrl!);
  const nonce = (value: string) => value.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce(policy)).not.toBe(nonce(second.headers()["content-security-policy"]));
  expect(first.headers()["referrer-policy"]).toBe("no-referrer");
  expect(first.headers()["x-frame-options"]).toBe("DENY");
});

test("the menu is painted in the shop's theme, set by the owner", async ({ page, request }) => {
  const theme = (preset: string, typeface: string) =>
    staff(request, "mutation($t: ThemeInput!) { updateTheme(theme: $t) { preset } }", {
      t: { preset, typeface, custom: { paper: "#f5eedc", ink: "#1b1916", accent: "#b83a2e", chrome: "paper" } },
    });
  await theme("seal", "source");
  await freshMenu(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "seal");
  await expect(page.locator("html")).toHaveAttribute("data-typeface", "source");
  // Seal puts the shop's header on vermilion, as it does the dashboard's side menu.
  const header = await page.locator("header").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(header).toBe("rgb(184, 58, 46)");
  await theme("dan", "plex");
});

test("a sold-out dish cannot be added", async ({ page, request }) => {
  await staff(request, 'mutation { updateMenuItem(id: "item-2", patch: { soldOut: true }) { id } }');
  await freshMenu(page);
  const dish = page.getByTestId("dish-2");
  await expect(dish).toContainText("Sold out");
  await expect(dish.getByRole("button", { name: /^Add/ })).toHaveCount(0);
  await expect(page.getByTestId("allergens-1")).toContainText("Gluten");
  await staff(request, 'mutation { updateMenuItem(id: "item-2", patch: { soldOut: false }) { id } }');
});

test("a pay-at-the-shop order is followed live until it is collected", async ({ page, request }) => {
  await freshMenu(page);
  await checkout(page, "at_shop", `Live ${Date.now()}`);
  const status = page.getByTestId("order-status");
  await expect(status).toHaveAttribute("data-status", "new");
  await expect(page.getByTestId("order-payment")).toContainText("Pay at the shop");
  const number = Number((await page.getByTestId("order-number").textContent())?.replace("#", ""));
  expect(number).toBeGreaterThan(0);

  // Mark the page, so a reload would show: every update below must arrive without one.
  await page.evaluate(() => ((window as unknown as { untouched: boolean }).untouched = true));
  const orders = (await staff(request, "{ orders { id number } }")) as { orders: { id: string; number: number }[] };
  const id = orders.orders.find((order) => order.number === number)!.id;
  for (const [next, words] of [["preparing", "cooking"], ["ready", "Ready to collect"], ["completed", "Collected"]] as const) {
    await staff(request, "mutation($id: ID!, $s: OrderStatus!) { updateOrder(id: $id, status: $s) { id } }", { id, s: next });
    await expect(status).toHaveAttribute("data-status", next, { timeout: 3000 });
    await expect(page.getByTestId("order-message")).toContainText(words);
  }
  expect(await page.evaluate(() => (window as unknown as { untouched?: boolean }).untouched)).toBe(true);
});

test("a table's link makes an eat-in order that is brought to that table", async ({ page, request }) => {
  await freshMenu(page);
  await page.goto("/?table=Patio%202");
  await expect(page.getByTestId("ordering-for")).toHaveText(/Eat in · Table Patio 2/);
  await checkout(page, "at_shop", `Table ${Date.now()}`);
  await expect(page.getByTestId("order-table")).toContainText("Patio 2");
  await expect(page.getByTestId("order-payment")).toContainText("Pay at the counter before you leave");
  const number = Number((await page.getByTestId("order-number").textContent())?.replace("#", ""));
  const orders = (await staff(request, "{ orders { id number fulfilment table } }")) as {
    orders: { id: string; number: number; fulfilment: string; table: string | null }[];
  };
  const placed = orders.orders.find((order) => order.number === number)!;
  expect(placed).toMatchObject({ fulfilment: "eat_in", table: "Patio 2" });
  for (const [next, words] of [["preparing", "cooking"], ["ready", "on its way to your table"], ["completed", "Served"]] as const) {
    await staff(request, "mutation($id: ID!, $s: OrderStatus!) { updateOrder(id: $id, status: $s) { id } }", { id: placed.id, s: next });
    await expect(page.getByTestId("order-message")).toContainText(words, { timeout: 3000 });
  }

  // Leaving the table turns the next order back into a collection.
  await page.goto("/");
  await page.getByTestId("not-at-table").click();
  await expect(page.getByTestId("ordering-for")).toHaveText(/Order for collection/);
  // A bad table name in a link is ignored.
  await page.goto("/?table=%3Cscript%3E");
  await expect(page.getByTestId("ordering-for")).toHaveText(/Order for collection/);
});

const STRIPE_STUB = `
window.Stripe = function () {
  return {
    _registerWrapper: function () {},
    elements: function () {
      return {
        create: function () {
          return {
            on: function (event, callback) { if (event === "ready") setTimeout(callback, 10); },
            mount: function (element) {
              var form = document.createElement("div");
              form.textContent = "Test card form";
              form.setAttribute("data-testid", "stub-card-form");
              element.appendChild(form);
            },
          };
        },
      };
    },
    confirmPayment: function () { return Promise.resolve({ paymentIntent: { status: "succeeded" } }); },
  };
};
window.Stripe.version = 3;
`;

test("a card order waits for Stripe, then reaches the counter live", async ({ page, request }) => {
  test.skip(!fakeStripe || !webhookSecret, "Set DAN_E2E_FAKE_STRIPE_URL and DAN_E2E_WEBHOOK_SECRET to run the card test.");
  // Stripe's own script is replaced by a stand-in; the card form is Stripe's to test.
  await page.route("https://js.stripe.com/**", (route) => route.fulfill({ contentType: "application/javascript", body: STRIPE_STUB }));
  await freshMenu(page);
  await checkout(page, "card", `Card ${Date.now()}`);
  const status = page.getByTestId("order-status");
  await expect(status).toHaveAttribute("data-status", "awaiting_payment");
  await expect(page.getByTestId("order-number")).toContainText("Number given once paid");
  await expect(page.getByTestId("stub-card-form")).toBeVisible();
  await page.getByTestId("pay-button").click();

  // Stripe confirms: its signed notification reaches the shop server.
  const intent = (await (await request.get(`${fakeStripe}/__test/latest`)).json()) as Record<string, unknown>;
  await request.post(`${fakeStripe}/__test/succeed/${String(intent.id)}`);
  const paid = { ...intent, status: "succeeded", amount_received: intent.amount };
  const body = JSON.stringify({ id: "evt_e2e", type: "payment_intent.succeeded", data: { object: paid } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${body}`).digest("hex");
  const delivered = await request.post(`${publicUrl}/stripe/webhook`, {
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}`, "content-type": "application/json" },
    data: body,
  });
  expect(delivered.status()).toBe(200);

  await expect(status).toHaveAttribute("data-status", "new", { timeout: 3000 });
  await expect(page.getByTestId("order-number")).toContainText("#");
  await expect(page.getByTestId("order-payment")).toContainText("Paid by card");
  await expect(page.getByTestId("card-payment")).toHaveCount(0);
});

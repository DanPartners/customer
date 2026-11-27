import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Dish options and add-ons, against a real Dan shop server (see
 * ordering.spec.ts for how to point these tests at one; they change the
 * shop's menu, so never at a shop in service).
 *
 * The owner gives a dish its options and the shop its add-ons; the customer
 * chooses how the dish is taken, sees the bill the shop works out (never one
 * worked out here), ticks an add-on and unticks another, and the order that
 * reaches the counter is that bill to the penny.
 */
const staffUrl = process.env.DAN_E2E_STAFF_URL;
const publicUrl = process.env.DAN_E2E_PUBLIC_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";

test.skip(!staffUrl || !publicUrl, "Set DAN_E2E_STAFF_URL and DAN_E2E_PUBLIC_URL to run against a real shop server.");

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

const SET_ADDONS = "mutation($a: [AddonInput!]!) { updateAddons(addons: $a) { id } }";
const SET_OPTIONS = "mutation($id: ID!, $p: MenuItemPatch!) { updateMenuItem(id: $id, patch: $p) { number } }";

async function riceId(request: APIRequestContext): Promise<string> {
  const data = (await staff(request, "{ menu { items { id number } } }")) as { menu: { items: { id: string; number: number }[] } };
  return data.menu.items.find((item) => item.number === 81)!.id;
}

test("a customer chooses how a dish is taken, ticks add-ons, and pays the bill the shop worked out", async ({ page, request }) => {
  const rice = await riceId(request);
  await staff(request, SET_OPTIONS, {
    id: rice,
    p: {
      options: [
        { id: "size", nameEn: "Size", nameZh: "份量", kind: "one", choices: [{ id: "regular", nameEn: "Regular" }, { id: "large", nameEn: "Large", nameZh: "大", pricePence: 150 }] },
        { id: "extras", nameEn: "Extras", kind: "any", choices: [{ id: "cheese", nameEn: "Cheese", pricePence: 80, allergens: ["milk"] }] },
      ],
    },
  });
  await staff(request, SET_ADDONS, {
    a: [
      { id: "service", nameEn: "Service charge", nameZh: "服務費", scope: "bill", kind: "percent", value: 1000, required: true },
      { id: "bag", nameEn: "Carrier bag", scope: "bill", kind: "fixed", value: 10 },
      { id: "web", nameEn: "Web offer", scope: "bill", kind: "percent", value: -500, auto: true, channels: "online" },
      { id: "staff", nameEn: "Staff discount", scope: "bill", kind: "percent", value: -2000, channels: "local" },
      { id: "sauce", nameEn: "Extra sauce", scope: "dish", kind: "fixed", value: 50 },
    ],
  });
  try {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId("dish-1")).toBeVisible();

    // The rice says it has a choice to make, and asks before it is added.
    await page.getByRole("button", { name: /Rice/ }).first().click();
    await expect(page.getByTestId("options-81")).toHaveText("Choose: Size · Extras");
    await page.getByTestId("choose-81").click();
    const chooser = page.getByTestId("dish-chooser");
    await expect(chooser).toBeVisible();
    await expect(chooser.getByTestId("choice-regular")).toBeChecked();
    await expect(chooser.getByTestId("chooser-price")).toHaveText("£3.90");
    await chooser.getByTestId("choice-large").check();
    await expect(chooser.getByTestId("choice-regular")).not.toBeChecked();
    // A choice says the allergens it brings before it is chosen.
    await expect(chooser.getByTestId("choice-allergens-cheese")).toHaveText("Allergens: Milk");
    await chooser.getByTestId("choice-cheese").check();
    await expect(chooser.getByTestId("chooser-price")).toHaveText("£6.20");
    await chooser.getByTestId("addon-sauce").check();
    await chooser.getByRole("button", { name: "Add", exact: true }).click();
    await expect(chooser.getByTestId("chooser-qty")).toHaveText("2");
    await chooser.getByTestId("chooser-add").click();
    await expect(chooser).toBeHidden();
    await expect(page.getByTestId("in-order-81")).toHaveText("2 in your order");

    // With an add-on for a dish to tick, every dish asks. The duck is taken as it comes.
    await page.getByRole("button", { name: /Appetisers/ }).first().click();
    await page.getByTestId("choose-1").click();
    await expect(chooser.getByTestId("addon-sauce")).not.toBeChecked();
    await chooser.getByTestId("chooser-add").click();
    // The bar gives no figure: with add-ons, the bill is the shop's to work out.
    await expect(page.getByTestId("basket-bar")).toContainText("3 items");
    await expect(page.getByTestId("basket-total")).toHaveCount(0);
    await page.getByTestId("basket-bar").click();

    // The checkout shows the shop's own figures.
    const line = page.getByTestId("checkout-line");
    await expect(line).toHaveCount(2);
    await expect(line.first().getByTestId("line-choices")).toHaveText("Large · Cheese");
    await expect(line.first().getByTestId("line-addon")).toHaveText("+ Extra sauce £1.00");
    // 2 x (3.90 + 1.50 + 0.80) + 2 x 0.50.
    await expect(line.first().getByTestId("line-total")).toHaveText("£13.40");
    await expect(line.nth(1).getByTestId("line-total")).toHaveText("£11.80");
    const addons = page.getByTestId("checkout-addons");
    // The staff-only discount is never offered here; the required charge is a line, not a choice.
    await expect(addons).not.toContainText("Staff discount");
    await expect(addons.getByTestId("bill-addon-service")).toHaveCount(0);
    await expect(addons.getByTestId("bill-addon-amount-service")).toHaveText("£2.52");
    await expect(addons.getByTestId("bill-addon-web")).toBeChecked();
    await expect(addons.getByTestId("bill-addon-amount-web")).toHaveText("-£1.26");
    await expect(addons.getByTestId("bill-addon-bag")).not.toBeChecked();
    await expect(page.getByTestId("checkout-total")).toHaveText("£26.46");
    await addons.getByTestId("bill-addon-bag").check();
    await expect(page.getByTestId("checkout-total")).toHaveText("£26.56");
    await addons.getByTestId("bill-addon-web").uncheck();
    await expect(page.getByTestId("checkout-total")).toHaveText("£27.82");
    // The cheese's milk is in the allergen check.
    await expect(page.getByTestId("allergen-check")).toContainText("Milk");

    const name = `Options ${Date.now()}`;
    await page.getByTestId("pay-at_shop").check();
    await page.getByTestId("allergen-confirm").check();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Phone number").fill(`07700 9${String(Date.now()).slice(-5)}`);
    await page.getByTestId("send-order").click();
    const status = page.getByTestId("order-status");
    await expect(status).toBeVisible();
    await expect(status.getByTestId("status-choices")).toHaveText("Large · Cheese");
    await expect(status.getByTestId("status-line-addon")).toHaveText("+ Extra sauce £1.00");
    await expect(status.getByTestId("status-addon")).toHaveText(["Service charge£2.52", "Carrier bag£0.10"]);
    await expect(status).toContainText("£27.82");

    // The order at the counter is that bill to the penny.
    const board = (await staff(request, "{ orders { customerName totalPence addons { id amountPence } lines { number qty unitPricePence options { choiceId } addons { id amountPence } } } }")) as {
      orders: { customerName: string; totalPence: number; addons: unknown[]; lines: unknown[] }[];
    };
    const placed = board.orders.find((order) => order.customerName === name)!;
    expect(placed.totalPence).toBe(2782);
    expect(placed.addons).toEqual([
      { id: "service", amountPence: 252 },
      { id: "bag", amountPence: 10 },
    ]);
    expect(placed.lines).toEqual([
      { number: 81, qty: 2, unitPricePence: 620, options: [{ choiceId: "large" }, { choiceId: "cheese" }], addons: [{ id: "sauce", amountPence: 100 }] },
      { number: 1, qty: 1, unitPricePence: 1180, options: [], addons: [] },
    ]);
  } finally {
    // Left as it was found: the other tests meet a shop with no options and no add-ons.
    await staff(request, SET_ADDONS, { a: [] });
    await staff(request, SET_OPTIONS, { id: rice, p: { options: [] } });
  }
});

test("a shop with options but no add-ons: the basket and the bill are worked out here, as before", async ({ page, request }) => {
  const rice = await riceId(request);
  await staff(request, SET_OPTIONS, {
    id: rice,
    p: { options: [{ id: "size", nameEn: "Size", kind: "one", choices: [{ id: "regular", nameEn: "Regular" }, { id: "large", nameEn: "Large", pricePence: 150 }] }] },
  });
  try {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId("dish-1")).toBeVisible();
    // A dish without options is still one tap, with its stepper.
    await page.getByRole("button", { name: /^Add: 1 / }).click();
    await page.getByRole("button", { name: /Rice/ }).first().click();
    await page.getByTestId("choose-81").click();
    const chooser = page.getByTestId("dish-chooser");
    await chooser.getByTestId("choice-large").check();
    await chooser.getByTestId("chooser-add").click();
    // The same rice the regular way is another line.
    await page.getByTestId("choose-81").click();
    await chooser.getByTestId("chooser-add").click();
    await expect(page.getByTestId("in-order-81")).toHaveText("2 in your order");
    // 11.80 + 5.40 + 3.90.
    await expect(page.getByTestId("basket-total")).toHaveText("£21.10");
    await page.getByTestId("basket-bar").click();
    await expect(page.getByTestId("checkout-line")).toHaveCount(3);
    await expect(page.getByTestId("line-choices")).toHaveText(["Large", "Regular"]);
    await expect(page.getByTestId("checkout-total")).toHaveText("£21.10");
    await expect(page.getByTestId("checkout-addons")).toHaveCount(0);
  } finally {
    await staff(request, SET_OPTIONS, { id: rice, p: { options: [] } });
  }
});

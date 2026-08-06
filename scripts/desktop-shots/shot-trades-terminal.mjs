/* Screenshot and exercise the desktop Trades terminal (3c): the five rail modes
   and every mutation they own — desktop + touch tablet.

   Layers two screen-specific fixtures on the shared baseline: a paid deposit so
   the balance path is reachable, and a client with no quote so the deposit and
   balance chips can be seen correctly disabled. */
import { mkdir } from "node:fs/promises";
import {
  BASE_URL,
  C,
  CLIENTS,
  INVOICES,
  MERCHANT_ID,
  Q,
  QUOTES,
  SITE,
  ago,
  assertVisible,
  json,
  newTradesPage,
  runTradesShots,
} from "./trades-fixtures.mjs";

const OUT = "/tmp/taptpay-desktop-3c";

const TOM = "00000000-0000-4000-8000-00000000000a";

/* Lisa's quote Q.sent totals $860; a paid $172 deposit leaves a $688 balance. */
const PAID_DEPOSIT = {
  ...INVOICES[0],
  id: "paid-deposit-lisa",
  clientProfileId: C.lisa,
  quoteId: Q.sent,
  kind: "deposit",
  amountCents: 17200,
  status: "paid",
  dueAt: ago(4),
  paidAt: ago(3),
  createdAt: ago(6),
};

const TOM_WALKER = {
  ...CLIENTS[0],
  id: TOM,
  firstName: "Tom",
  lastName: "Walker",
  email: "tom@example.invalid",
  siteAddress: "96 Albert Road, Auckland",
  status: "active",
};

async function shoot(browser, label, contextOptions) {
  const { context, page, errors } = await newTradesPage(browser, label, contextOptions);

  const posted = [];
  const clients = [...CLIENTS, TOM_WALKER];
  const invoices = [...INVOICES, PAID_DEPOSIT];
  const quotes = [...QUOTES];

  await page.route("**/api/trades/clients", (route) => json(route, clients));
  await page.route("**/api/trades/invoices", async (route) => {
    if (route.request().method() !== "POST") return json(route, invoices);
    const body = JSON.parse(route.request().postData() ?? "{}");
    posted.push({ url: "invoices", body });
    const created = { ...INVOICES[0], ...body, id: `created-${invoices.length}`, status: "dispatched" };
    invoices.push(created);
    return json(route, created, 201);
  });
  await page.route("**/api/trades/quotes", async (route) => {
    if (route.request().method() !== "POST") return json(route, quotes);
    const body = JSON.parse(route.request().postData() ?? "{}");
    posted.push({ url: "quotes", body });
    const created = { ...QUOTES[0], ...body, id: `quote-${quotes.length}`, status: "sent" };
    quotes.push(created);
    return json(route, created, 201);
  });
  await page.route("**/api/trades/invoices/*/send-balance", async (route) => {
    posted.push({ url: "send-balance", body: JSON.parse(route.request().postData() ?? "{}") });
    return json(route, { ...PAID_DEPOSIT, id: "balance-created", kind: "balance" }, 201);
  });
  await page.route("**/api/trades/invoices/*/mark-paid-external", async (route) => {
    posted.push({ url: "mark-paid-external", body: {} });
    return json(route, { ...INVOICES[0], status: "paid_external" });
  });
  await page.route(`**/api/merchants/${MERCHANT_ID}`, (route) =>
    json(route, {
      id: MERCHANT_ID,
      businessName: "Wallace Electrical",
      status: "active",
      gstRegistered: true,
      tradeGstMode: "inclusive",
    }),
  );

  try {
    await page.goto(`${BASE_URL}/trades/terminal`, { waitUntil: "networkidle" });
    await page.getByTestId("desktop-frame").waitFor({ state: "visible" });

    const screenshot = async (name) => {
      /* Longest page transition is 550ms; wait past it before capturing. */
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    };
    const rail = (name) => page.getByRole("button", { name, exact: true });
    const typeChip = (name) => page.getByRole("button", { name, exact: true });

    await assertVisible(page.getByText("revenue this week"), "revenue hero");
    await assertVisible(page.getByText("outstanding invoices"), "outstanding hero");
    await screenshot("1-invoice-empty");

    /* jobs list: filter chips narrow the stack */
    await page.getByRole("button", { name: "overdue", exact: true }).click();
    await screenshot("2-jobs-overdue");
    await page.getByRole("button", { name: "all", exact: true }).click();

    /* client picker */
    await rail("choose client").click();
    await assertVisible(
      page.getByRole("button", { name: "choose Lisa Nu", exact: true }),
      "client card",
    );
    await screenshot("3-client-picker");
    await page.getByRole("button", { name: "choose Lisa Nu", exact: true }).click();

    /* keypad → $1,240.00 */
    await rail("keypad").click();
    for (const key of ["1", "2", "4", "0"]) {
      await page.getByRole("button", { name: key, exact: true }).click();
    }
    await screenshot("4-keypad");
    await page.getByRole("button", { name: "confirm amount", exact: true }).click();

    await page.getByLabel("job note").fill("bathroom rewire — final");
    await assertVisible(page.getByText("$1,240.00"), "committed keypad amount");
    await screenshot("5-invoice-composed");

    /* Lisa has a live quote and a paid, quote-linked deposit, so both chips are
       available; the balance figure comes from the quote, not the keypad. */
    if (await typeChip("deposit").isDisabled()) {
      throw new Error("Expected deposit to be available for a client with a quote");
    }
    await typeChip("balance").click();
    await assertVisible(
      page.getByText(/balance is calculated from the quote total/),
      "server-computed balance hint",
    );
    await screenshot("6-balance-type");

    await typeChip("full").click();
    await page.getByRole("button", { name: /^send invoice$/ }).click();
    await assertVisible(page.getByText("invoice sent ✓"), "sent confirmation");
    const invoicePost = posted.find((p) => p.url === "invoices");
    if (!invoicePost) throw new Error("Expected the invoice POST to fire");
    if (invoicePost.body.amountCents !== 124000) {
      throw new Error(`Expected 124000 cents, got ${invoicePost.body.amountCents}`);
    }
    if (invoicePost.body.kind !== "full" || !invoicePost.body.clientProfileId) {
      throw new Error("Expected a client-linked full invoice");
    }
    if (invoicePost.body.jobDetails !== "bathroom rewire — final") {
      throw new Error("Expected the job note to be sent as jobDetails");
    }
    await screenshot("7-invoice-sent");

    /* quote builder */
    await rail("quote builder").click();
    await page.getByLabel("line 1 description").fill("Switchboard upgrade");
    await page.getByLabel("line 1 unit price").fill("1200");
    await page.getByRole("button", { name: "25%", exact: true }).click();
    await assertVisible(page.getByText("deposit on acceptance"), "deposit total row");
    await screenshot("8-quote-builder");

    await page.getByRole("button", { name: /^create quote$/ }).click();
    await assertVisible(page.getByText("quote created ✓"), "quote confirmation");
    const quotePost = posted.find((p) => p.url === "quotes");
    if (!quotePost) throw new Error("Expected the quote POST to fire");
    if (quotePost.body.lineItems?.[0]?.unitPriceCents !== 120000) {
      throw new Error("Expected the line item to be sent in cents");
    }
    if (quotePost.body.depositType !== "percent" || quotePost.body.depositValue !== 25) {
      throw new Error("Expected a 25% deposit on the quote");
    }
    await screenshot("9-quote-created");

    /* mark received */
    await rail("mark received").click();
    await assertVisible(page.getByText("Mark as received externally"), "mark-received panel");
    await screenshot("10-mark-received");
    await page.getByRole("button", { name: /^mark .* received$/ }).first().click();
    await page.waitForTimeout(400);
    if (!posted.some((p) => p.url === "mark-paid-external")) {
      throw new Error("Expected the mark-paid-external POST to fire");
    }

    /* a client with no quote can only be billed in full */
    await rail("choose client").click();
    await page.getByRole("button", { name: "choose Tom Walker", exact: true }).click();
    if (!(await typeChip("deposit").isDisabled())) {
      throw new Error("Expected deposit to be disabled without a quote");
    }
    if (!(await typeChip("balance").isDisabled())) {
      throw new Error("Expected balance to be disabled without a paid deposit");
    }
    await screenshot("11-no-quote-client");

    /* site scope narrows every column */
    await page.getByRole("button", { name: "all sites scope", exact: true }).click();
    await page.getByRole("option", { name: SITE.queen, exact: true }).click();
    await screenshot("12-scoped");

    if (errors.length) {
      throw new Error(`PAGE ERRORS:\n${errors.join("\n")}`);
    }
    return errors;
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await runTradesShots(shoot);
  console.log(`shots → ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

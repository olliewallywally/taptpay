/* Screenshot and exercise the desktop Trades client directory (3b): list, site
   scope, search and the add-client modal — desktop + touch tablet. */
import { mkdir } from "node:fs/promises";
import {
  BASE_URL,
  CLIENTS,
  SITE,
  assertAbsent,
  assertVisible,
  json,
  newTradesPage,
  runTradesShots,
} from "./trades-fixtures.mjs";

const OUT = "/tmp/taptpay-desktop-3b";

async function shoot(browser, label, contextOptions) {
  const { context, page, errors } = await newTradesPage(browser, label, contextOptions);

  /* Registered after the shared mocks, so this wins for /api/trades/clients.
     A POST appends to the served list, which is what the page's cache
     invalidation then refetches. */
  const clients = [...CLIENTS];
  await page.route("**/api/trades/clients", async (route) => {
    if (route.request().method() !== "POST") return json(route, clients);
    const body = JSON.parse(route.request().postData() ?? "{}");
    const created = {
      ...CLIENTS[0],
      ...body,
      id: "00000000-0000-4000-8000-0000000000ff",
      status: "active",
      archivedAt: null,
    };
    clients.push(created);
    return json(route, created, 201);
  });

  try {
    await page.goto(`${BASE_URL}/trades/clients`, { waitUntil: "networkidle" });
    await page.getByTestId("desktop-frame").waitFor({ state: "visible" });

    const screenshot = async (name) => {
      /* Longest page transition is 550ms; wait past it before capturing. */
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    };

    const row = (name) => page.getByRole("button", { name: `view ${name}`, exact: true });

    await assertVisible(row("Mike Thompson"), "active client row");
    await assertAbsent(row("Alice Archived"), "archived client in the directory");
    await assertAbsent(row("Priya Prospect"), "hidden prospect in the directory");
    await screenshot("1-directory");

    /* Search matches the site as well as the name. */
    const search = page.getByRole("textbox", {
      name: "search clients or site",
      exact: true,
    });
    await search.fill("kauri");
    await assertVisible(row("Sarah Chen"), "client matched by site");
    await assertAbsent(row("Mike Thompson"), "client not matching the site search");
    await screenshot("2-search-site");
    await search.fill("");

    const scopeButton = (name) =>
      page.getByRole("button", { name: `${name} scope`, exact: true });
    await scopeButton("all sites").click();
    await assertAbsent(
      page.getByRole("option", { name: SITE.archived, exact: true }),
      "archived-only site in the scope menu",
    );
    await assertAbsent(
      page.getByRole("option", { name: SITE.prospect, exact: true }),
      "prospect-only site in the scope menu",
    );
    await screenshot("3-scope-open");

    await page.getByRole("option", { name: SITE.queen, exact: true }).click();
    await assertVisible(row("Mike Thompson"), "client at the scoped site");
    await assertAbsent(row("Sarah Chen"), "client at another site while scoped");
    await screenshot("4-scope-filtered");

    await scopeButton(SITE.queen).click();
    await page.getByRole("option", { name: "all sites", exact: true }).click();

    /* add-client modal: empty (invalid), channel without a contact, then valid */
    await page.getByRole("button", { name: "add client", exact: true }).click();
    const submit = page.getByRole("button", { name: "Add client", exact: true });
    if (!(await submit.isDisabled())) {
      throw new Error("Expected the empty add-client form to be invalid");
    }
    await screenshot("5-add-empty");

    await page.getByLabel("first name").fill("Ana");
    await page.getByLabel("last name").fill("Reeves");
    await page.getByLabel("site address").fill("9 Totara Lane, Auckland");
    await page.getByRole("button", { name: "sms", exact: true }).click();
    if (!(await submit.isDisabled())) {
      throw new Error("Expected sms without a phone number to be invalid");
    }
    await screenshot("6-add-needs-phone");

    await page.getByLabel("phone").fill("021 555 0134");
    if (await submit.isDisabled()) {
      throw new Error("Expected the completed add-client form to be valid");
    }
    await screenshot("7-add-valid");

    await submit.click();
    await assertVisible(row("Ana Reeves"), "newly created client in the directory");
    await screenshot("8-added");

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

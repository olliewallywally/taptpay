/* Screenshot and exercise the desktop Trades client directory (3b): list, site
   scope, search and the add-client modal — desktop + touch tablet. */
import { mkdir } from "node:fs/promises";
import {
  BASE_URL,
  CLIENTS,
  INVOICES,
  SITE,
  assertAbsent,
  assertVisible,
  json,
  newTradesPage,
  runTradesShots,
} from "./trades-fixtures.mjs";

const OUT = "/tmp/taptpay-desktop-3b";
const LONG_CLIENT_ID = "00000000-0000-4000-8000-0000000000aa";
const LONG_FIRST_NAME = "A".repeat(80);
const LONG_LAST_NAME = "B".repeat(80);
const LONG_NAME = `${LONG_FIRST_NAME} ${LONG_LAST_NAME}`;
const LONG_SITE = `9 ${"Z".repeat(198)}`;

const LONG_CLIENT = {
  ...CLIENTS[0],
  id: LONG_CLIENT_ID,
  firstName: LONG_FIRST_NAME,
  lastName: LONG_LAST_NAME,
  siteAddress: LONG_SITE,
};

const SCROLL_CLIENTS = Array.from({ length: 8 }, (_, index) => ({
  ...CLIENTS[0],
  id: `00000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
  firstName: `Scroll${index + 1}`,
  lastName: "Client",
  siteAddress: `${index + 20} Scroll Test Road, Auckland`,
}));

async function shoot(browser, label, contextOptions) {
  const { context, page, errors } = await newTradesPage(browser, label, contextOptions);

  /* Registered after the shared mocks, so this wins for /api/trades/clients.
     A POST appends to the served list, which is what the page's cache
     invalidation then refetches. */
  const clients = [...CLIENTS, LONG_CLIENT, ...SCROLL_CLIENTS];
  const invoices = [
    ...INVOICES,
    {
      ...INVOICES[0],
      id: "long-client-paid",
      clientProfileId: LONG_CLIENT_ID,
      amountCents: 123456,
    },
  ];
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
  await page.route("**/api/trades/invoices", (route) => json(route, invoices));

  try {
    await page.goto(`${BASE_URL}/trades/clients`, { waitUntil: "networkidle" });
    await page.getByTestId("desktop-frame").waitFor({ state: "visible" });

    const screenshot = async (name) => {
      /* Longest page transition is 550ms; wait past it before capturing. */
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    };

    const row = (name) => page.getByRole("button", { name, exact: true });

    await assertVisible(row("Mike Thompson"), "active client row");
    await assertAbsent(row("Alice Archived"), "archived client in the directory");
    await assertAbsent(row("Priya Prospect"), "hidden prospect in the directory");
    await screenshot("1-directory");

    /* Boundary fixture: the API permits 80+80-character names and long site
       addresses. The row must wrap in its fixed 400px column, retain all
       visible details in the accessibility tree, and keep the list scrollable. */
    const longRow = row(LONG_NAME);
    await longRow.scrollIntoViewIfNeeded();
    await longRow.focus();
    const contract = await longRow.evaluate((element) => {
      const list = element.closest(".tc-list");
      const name = element.querySelector(".tc-row-name");
      const site = element.querySelector(".tc-row-site");
      const avatar = element.querySelector(".tc-avatar");
      const dot = element.querySelector(".tc-row-dot");
      const labelledBy = element.getAttribute("aria-labelledby");
      const describedBy = element.getAttribute("aria-describedby") ?? "";
      const label = labelledBy ? document.getElementById(labelledBy)?.textContent?.trim() : null;
      const description = describedBy
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ");
      const rowRect = element.getBoundingClientRect();
      const listRect = list?.getBoundingClientRect();
      return {
        active: document.activeElement === element,
        ariaLabel: element.getAttribute("aria-label"),
        label,
        description,
        avatarHidden: avatar?.getAttribute("aria-hidden"),
        dotHidden: dot?.getAttribute("aria-hidden"),
        nameWhiteSpace: name ? getComputedStyle(name).whiteSpace : null,
        nameOverflowWrap: name ? getComputedStyle(name).overflowWrap : null,
        siteWhiteSpace: site ? getComputedStyle(site).whiteSpace : null,
        siteOverflowWrap: site ? getComputedStyle(site).overflowWrap : null,
        rowScrollWidth: element.scrollWidth,
        rowClientWidth: element.clientWidth,
        rowLeft: rowRect.left,
        rowRight: rowRect.right,
        listLeft: listRect?.left ?? null,
        listRight: listRect?.right ?? null,
        listRowCount: list?.querySelectorAll(".tc-row").length ?? 0,
        listScrollHeight: list?.scrollHeight ?? 0,
        listClientHeight: list?.clientHeight ?? 0,
      };
    });

    if (!contract.active) throw new Error("Expected the long client row to receive focus");
    if (contract.ariaLabel !== null) throw new Error("Trades row still overrides its visible accessible name");
    if (contract.label !== LONG_NAME) throw new Error("Trades row accessible name lost the full visible name");
    if (contract.description !== `${LONG_SITE} paid $1,234.56`) {
      throw new Error("Trades row description did not include the full visible site, status and amount");
    }
    if (contract.avatarHidden !== "true" || contract.dotHidden !== "true") {
      throw new Error("Decorative trades row initials/status dot reached the accessibility tree");
    }
    if (
      contract.nameWhiteSpace !== "normal" ||
      contract.nameOverflowWrap !== "anywhere" ||
      contract.siteWhiteSpace !== "normal" ||
      contract.siteOverflowWrap !== "anywhere"
    ) {
      throw new Error("Long trades client text is not configured to wrap anywhere");
    }
    if (contract.rowScrollWidth > contract.rowClientWidth + 1) {
      throw new Error("Long trades client content clips horizontally inside its row");
    }
    if (
      contract.listLeft === null ||
      contract.listRight === null ||
      contract.rowLeft < contract.listLeft - 1 ||
      contract.rowRight > contract.listRight + 1
    ) {
      throw new Error("Long trades client row escaped the fixed directory column");
    }
    if (contract.listRowCount < 10 || contract.listScrollHeight <= contract.listClientHeight) {
      throw new Error("Expected 10+ trades rows to remain vertically scrollable");
    }
    await screenshot("1b-long-content");
    await page.locator(".tc-list").evaluate((element) => { element.scrollTop = 0; });

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

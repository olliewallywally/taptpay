/*
 * Owner decision 2026-09-25 (2c): "bring it back"
 * (docs/decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md).
 *
 * Since 7b99299a (2026-06-02) put "bill" in the bar slot that held "batch", nothing
 * on a phone opened the batch-send-and-schedules screen. Rent automations could not
 * be paused, resumed or cancelled, batch resend could not be reached, and the
 * overdue-reminder settings (on the same screen) could not be changed.
 *
 * The bar holds four items in every vertical and was sized to fit them from 320px
 * up, so the entry is back beside the rent requests it drives. The real page and
 * the real view render together here, so this checks the whole path a tap takes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import PropertyTerminal from "./property-terminal";

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body) }) as Response;

const TENANT = {
  id: "tenant-mia", firstName: "Mia", lastName: "Hart", propertyAddress: "18 Tui St",
  preferredChannel: "email", email: "mia@example.test",
};
const SCHEDULE = {
  id: "schedule-mia", tenantProfileId: "tenant-mia", amountCents: 62000, frequency: "weekly",
  status: "active", nextRunDate: "2026-10-01T00:00:00.000Z",
};
const REMINDERS = { enabled: true, firstReminderDays: 3, repeatEveryDays: 3, maxReminders: 3 };

let writes: Array<{ method: string; url: string; body?: string }>;

beforeEach(() => {
  writes = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url === "/api/property/tenants") return reply([TENANT]);
    if (method === "GET" && url === "/api/property/invoices") return reply([]);
    if (method === "GET" && url === "/api/property/schedules") return reply([SCHEDULE]);
    if (method === "GET" && url === "/api/property/reminder-settings") return reply(REMINDERS);
    writes.push({ method, url, body: typeof init?.body === "string" ? init.body : undefined });
    if (url === "/api/property/schedules/schedule-mia") return reply({ ...SCHEDULE, status: "paused" });
    throw new Error(`Unhandled test request: ${method} ${url}`);
  });
});

function renderTerminal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PropertyTerminal />
    </QueryClientProvider>,
  );
}

async function openSchedules() {
  fireEvent.click(await screen.findByRole("button", { name: "batch send and schedules" }));
  expect(await screen.findByText("batch send")).toBeInTheDocument();
  fireEvent.click(screen.getByText("schedules"));
  await screen.findByText("overdue reminders");
}

describe("rent automations on a phone (owner decision 2026-09-25, 2c)", () => {
  it("the terminal's home opens batch send and schedules", async () => {
    const { container } = renderTerminal();

    await openSchedules();

    expect(screen.getByText("recurring rent")).toBeInTheDocument();
    expect(await screen.findByText("Mia Hart")).toBeInTheDocument();
    // The mode bar floats where this screen's tabs are, so it stays out of the way.
    expect(container.querySelector(".tp-psubbar")).toHaveClass("hide");
  });

  it("an automation can be paused again", async () => {
    renderTerminal();
    await openSchedules();

    fireEvent.click(await screen.findByRole("button", { name: /pause/ }));

    await waitFor(() => expect(writes).toEqual([
      { method: "PUT", url: "/api/property/schedules/schedule-mia", body: JSON.stringify({ status: "paused" }) },
    ]));
  });

  it("an automation can be cancelled again", async () => {
    renderTerminal();
    await openSchedules();

    fireEvent.click(await screen.findByRole("button", { name: "cancel automation" }));

    await waitFor(() => expect(writes).toEqual([
      { method: "DELETE", url: "/api/property/schedules/schedule-mia", body: undefined },
    ]));
  });
});

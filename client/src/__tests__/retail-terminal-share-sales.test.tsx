import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import RetailTerminalView, {
  type RetailShareSale,
  type RetailTerminalState,
} from "@/features/terminal/retail/RetailTerminalView";

/*
 * Owner decision 2026-09-25 (docs/decisions/2026-09-25-share-dropdown-and-fixes-owner-answers.md):
 * - the share page has a dropdown at the top of its blue section to choose which sale to share;
 *   after a sale is sent the terminal opens the share page with that sale chosen, and coming back
 *   shows the latest sale until another is chosen;
 * - a cash sale is recorded for real before "success", and its receipt link is that sale's.
 * The landing demo (no liveState) is unchanged.
 */

const emptyLive: RetailTerminalState = { items: [], pending: null, sent: [] };

const sale = (id: number, name: string, amount: number): RetailShareSale => ({
  id,
  name,
  amount,
  payLink: `https://pay.example/pay/t/token-${id}`,
  qrElement: <img alt={`qr for sale ${id}`} src={`https://pay.example/api/pay/t/token-${id}/qr`} />,
});

const openShare = () => fireEvent.click(screen.getByRole("button", { name: "share" }));
const openHome = () => fireEvent.click(document.querySelector('.tp-layer:not(.leaving) button[aria-label="cancel"]') as HTMLElement);
// Screens slide: the one leaving stays in the page for a moment, so read the arriving one.
const arriving = () => within(document.querySelector(".tp-layer:not(.leaving)") as HTMLElement);
const picker = () => arriving().getByRole("combobox", { name: "sale to share" }) as HTMLSelectElement;

async function typeSale(amountDigits: string[], name: string) {
  const commit = () =>
    fireEvent.click(document.querySelector('.tp-layer:not(.leaving) button[aria-label="commit"]') as HTMLElement);
  fireEvent.click(screen.getByRole("button", { name: "add item" }));
  for (const digit of amountDigits) fireEvent.click(await screen.findByRole("button", { name: digit }));
  commit();
  fireEvent.change(await screen.findByPlaceholderText("item name"), { target: { value: name } });
  commit();
}

describe("the live share page's sale dropdown", () => {
  it("lists the sales it can share, newest first and chosen, and shares that sale's own link and QR", async () => {
    const onShare = jest.fn();
    render(
      <RetailTerminalView
        liveState={emptyLive}
        liveShareSales={[sale(12, "flat white", 550), sale(11, "toastie", 900)]}
        onShare={onShare}
      />,
    );

    openShare();

    expect(picker().value).toBe("12");
    expect(within(picker()).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "flat white · $5.50",
      "toastie · $9.00",
    ]);
    expect(screen.getByText("flat white")).toBeInTheDocument();
    expect(screen.getByAltText("qr for sale 12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "copy link" }));
    await waitFor(() =>
      expect(onShare).toHaveBeenCalledWith(expect.objectContaining({
        kind: "payment", channel: "copy", url: "https://pay.example/pay/t/token-12", amountCents: 550, label: "flat white",
      })),
    );
    expect(document.body.innerHTML).not.toContain("demo-abc123");
  });

  it("shares the sale chosen in the dropdown, and keeps it chosen on coming back", async () => {
    const onShare = jest.fn();
    render(
      <RetailTerminalView
        liveState={emptyLive}
        liveShareSales={[sale(12, "flat white", 550), sale(11, "toastie", 900)]}
        onShare={onShare}
      />,
    );
    openShare();

    fireEvent.change(picker(), { target: { value: "11" } });
    expect(screen.getByText("toastie")).toBeInTheDocument();
    expect(screen.getByAltText("qr for sale 11")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "share via SMS" }));
    await waitFor(() =>
      expect(onShare).toHaveBeenLastCalledWith(expect.objectContaining({
        channel: "sms", url: "https://pay.example/pay/t/token-11",
      })),
    );

    openHome();
    await screen.findByRole("button", { name: "add item" });
    openShare();
    expect(picker().value).toBe("11");
  });

  it("chooses a newly sent sale, and falls back to the latest when the chosen one is paid", () => {
    const { rerender } = render(
      <RetailTerminalView
        liveState={emptyLive}
        liveShareSales={[sale(12, "flat white", 550), sale(11, "toastie", 900)]}
        onShare={jest.fn()}
      />,
    );
    openShare();
    fireEvent.change(picker(), { target: { value: "11" } });

    // A sale sent from here arrives at the top: it becomes the one shown.
    rerender(
      <RetailTerminalView
        liveState={emptyLive}
        liveShareSales={[sale(13, "brownie", 450), sale(12, "flat white", 550), sale(11, "toastie", 900)]}
        onShare={jest.fn()}
      />,
    );
    expect(picker().value).toBe("13");

    // Chosen by hand again, then paid: it leaves the list, and the latest is shown.
    fireEvent.change(picker(), { target: { value: "11" } });
    rerender(
      <RetailTerminalView
        liveState={emptyLive}
        liveShareSales={[sale(13, "brownie", 450), sale(12, "flat white", 550)]}
        onShare={jest.fn()}
      />,
    );
    expect(picker().value).toBe("13");

    // The newest being paid is not a new sale: a hand choice stays.
    fireEvent.change(picker(), { target: { value: "12" } });
    rerender(
      <RetailTerminalView
        liveState={emptyLive}
        liveShareSales={[sale(12, "flat white", 550)]}
        onShare={jest.fn()}
      />,
    );
    expect(picker().value).toBe("12");
  });

  it("with nothing to share, says so: no dropdown, no buttons, never a demo link", () => {
    render(<RetailTerminalView liveState={emptyLive} liveShareSales={[]} onShare={jest.fn()} />);
    openShare();

    expect(screen.getByText("no payment link to share yet")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "sale to share" })).toBeNull();
    expect(screen.queryByRole("button", { name: "copy link" })).toBeNull();
    expect(document.body.innerHTML).not.toContain("demo-abc123");
  });

  it("opens the share page with the sale just sent", async () => {
    let shareSales: RetailShareSale[] = [];
    const view = (sales: RetailShareSale[]) => (
      <RetailTerminalView liveState={emptyLive} liveShareSales={sales} onCreateSale={onCreateSale} onShare={jest.fn()} />
    );
    const onCreateSale = jest.fn(async () => {
      shareSales = [sale(21, "phone sale", 1234)];
      rerender(view(shareSales));
    });
    const { rerender } = render(view(shareSales));

    await typeSale(["1", "2", "3", "4"], "phone sale");
    fireEvent.click(await screen.findByRole("button", { name: "send" }));

    await waitFor(() => expect(picker().value).toBe("21"));
    expect(screen.getByAltText("qr for sale 21")).toBeInTheDocument();
    expect(onCreateSale).toHaveBeenCalledTimes(1);
  });

  it("stays put with the sale kept when sending fails", async () => {
    const onCreateSale = jest.fn(async () => {
      throw new Error("offline");
    });
    render(<RetailTerminalView liveState={emptyLive} liveShareSales={[]} onCreateSale={onCreateSale} onShare={jest.fn()} />);

    await typeSale(["5", "0", "0"], "failed sale");
    fireEvent.click(await screen.findByRole("button", { name: "send" }));

    await waitFor(() => expect(onCreateSale).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByRole("combobox", { name: "sale to share" })).toBeNull();
    expect(screen.queryByText("no payment link to share yet")).toBeNull();
    expect(screen.getByRole("button", { name: "send" })).toBeInTheDocument();
  });
});

describe("a live cash sale", () => {
  async function enterCash(name: string, amount: string) {
    fireEvent.click(screen.getByRole("button", { name: "cash" }));
    fireEvent.change(await screen.findByPlaceholderText("item name"), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText("amount"), { target: { value: amount } });
  }

  it("is recorded before success shows, once however often confirm is tapped, with its own receipt link", async () => {
    let finish!: () => void;
    const onCashSale = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onShare = jest.fn();
    const view = (receipt: { name: string; amount: number; url: string } | null) => (
      <RetailTerminalView liveState={emptyLive} onCashSale={onCashSale} onShare={onShare} liveReceipt={receipt} />
    );
    const { rerender } = render(view(null));

    await enterCash("muffin", "4.50");
    const confirm = screen.getByRole("button", { name: "confirm" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onCashSale).toHaveBeenCalledTimes(1);
    expect(onCashSale).toHaveBeenCalledWith({ name: "muffin", amount: 450 });
    expect(screen.queryByText("success")).toBeNull();

    rerender(view({ name: "muffin", amount: 450, url: "https://pay.example/receipt/77" }));
    await act(async () => finish());

    expect(await screen.findByText("success")).toBeInTheDocument();
    // The recorded amount, where live use showed $0.00 (liveState never has a pending sale).
    expect(screen.getByText("$4.50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "copy receipt link" }));
    await waitFor(() =>
      expect(onShare).toHaveBeenCalledWith(expect.objectContaining({
        kind: "receipt", channel: "copy", url: "https://pay.example/receipt/77", amountCents: 450,
      })),
    );
    expect(document.body.innerHTML).not.toContain("demo-abc123");
  });

  it("does not show success when recording fails, and keeps what was typed", async () => {
    const onCashSale = jest.fn(async () => {
      throw new Error("offline");
    });
    render(<RetailTerminalView liveState={emptyLive} onCashSale={onCashSale} onShare={jest.fn()} liveReceipt={null} />);

    await enterCash("muffin", "4.50");
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));

    await waitFor(() => expect(onCashSale).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByText("success")).toBeNull();
    expect((screen.getByPlaceholderText("item name") as HTMLInputElement).value).toBe("muffin");
  });
});

describe("the landing demo is unchanged", () => {
  it("shares the demo link with no dropdown", async () => {
    const onShare = jest.fn();
    render(<RetailTerminalView onShare={onShare} />);
    openShare();

    expect(screen.queryByRole("combobox", { name: "sale to share" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "copy link" }));
    await waitFor(() =>
      expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ url: "https://pay.taptpay.com/p/demo-abc123" })),
    );
  });
});

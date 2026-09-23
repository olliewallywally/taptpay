import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import RetailTerminalView, {
  type RetailTerminalItem,
  type RetailTerminalState,
} from "@/features/terminal/retail/RetailTerminalView";

const retailViewRoot = join(process.cwd(), "client/src/features/terminal/retail");

const sourceFiles = readdirSync(retailViewRoot)
  .filter((file) => /\.(?:js|jsx|ts|tsx)$/.test(file) && !file.endsWith(".d.ts"))
  .map((file) => ({
    file,
    source: readFileSync(join(retailViewRoot, file), "utf8"),
  }));

const forbiddenSource = [
  { name: "routing", pattern: /from\s+["']wouter["']/ },
  { name: "TanStack Query", pattern: /@tanstack\/react-query/ },
  { name: "production API helper", pattern: /(?:queryClient|apiRequest|sseClient)/ },
  { name: "auth", pattern: /(?:authToken|getCurrentMerchantId|\/lib\/auth)/ },
  { name: "network", pattern: /\b(?:fetch|XMLHttpRequest|EventSource|WebSocket)\s*\(/ },
  { name: "storage", pattern: /\b(?:localStorage|sessionStorage)\b/ },
  { name: "provider", pattern: /\b(?:PaymentRequest|ApplePaySession|GooglePay|Windcave)\b/ },
  { name: "clipboard", pattern: /navigator\s*\.\s*clipboard/ },
  { name: "external navigation", pattern: /window\s*\.\s*(?:open|location)/ },
  { name: "document effect", pattern: /document\s*\.\s*(?:cookie|createElement)/ },
  { name: "external share scheme", pattern: /(?:mailto:|sms:)/ },
  { name: "file creation", pattern: /(?:URL\.createObjectURL|new\s+Blob\s*\()/ },
];

const existingTransaction: RetailTerminalItem = {
  id: 41,
  name: "flat white x2",
  amount: 1250,
  status: "awaiting payment",
};

const existingState: RetailTerminalState = {
  items: [],
  pending: existingTransaction,
  sent: [],
};

describe("RetailTerminalView safety boundary", () => {
  it("contains no auth, query, network, storage, provider, share or navigation effects", () => {
    for (const { file, source } of sourceFiles) {
      for (const forbidden of forbiddenSource) {
        expect({ file, boundary: forbidden.name, match: source.match(forbidden.pattern)?.[0] }).toEqual({
          file,
          boundary: forbidden.name,
          match: undefined,
        });
      }
    }
  });

  it("does not recreate an existing live transaction when ordinary send is pressed", async () => {
    const onCreateSale = jest.fn();
    render(<RetailTerminalView liveState={existingState} onCreateSale={onCreateSale} />);

    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => expect(onCreateSale).not.toHaveBeenCalled());
  });

  // R0-T5 containment: Tap to Pay is disabled server-side and has no
  // provider-authoritative implementation, so the control must not be offered
  // unless a caller explicitly opts in. The delegation test below keeps the
  // wiring covered for when the feature gate opens.
  it("does not offer paywave by default, because the route behind it refuses", () => {
    render(<RetailTerminalView liveState={existingState} onCreateSale={jest.fn()} />);

    expect(screen.queryByRole("button", { name: "paywave" })).toBeNull();
  });

  it("delegates paywave for an existing live transaction without recreating it locally", async () => {
    const onCreateSale = jest.fn().mockResolvedValue(undefined);
    render(<RetailTerminalView liveState={existingState} onCreateSale={onCreateSale} showPaywave />);

    fireEvent.click(screen.getByRole("button", { name: "paywave" }));
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(onCreateSale).toHaveBeenCalledTimes(1);
      expect(onCreateSale).toHaveBeenCalledWith(existingTransaction, {
        paywave: true,
        existing: true,
      });
    });
  });

  /* R1-T9: no double submit. A second tap on send while the first sale is still
     being created made a second sale (a second payment link). */
  it("sends one sale however often send is tapped while it is being created; a failed one can be sent again", async () => {
    const outcomes: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    const onCreateSale = jest.fn(() => new Promise<void>((resolve, reject) => { outcomes.push({ resolve, reject }); }));
    render(<RetailTerminalView liveState={{ items: [], pending: null, sent: [] }} onCreateSale={onCreateSale} />);
    const commit = () =>
      fireEvent.click(document.querySelector('.tp-layer:not(.leaving) button[aria-label="commit"]') as HTMLElement);

    fireEvent.click(screen.getByRole("button", { name: "add item" }));
    for (const digit of ["1", "2", "3", "4"]) fireEvent.click(await screen.findByRole("button", { name: digit }));
    commit();
    fireEvent.change(await screen.findByPlaceholderText("item name"), { target: { value: "phone sale" } });
    commit();

    const send = await screen.findByRole("button", { name: "send" });
    fireEvent.click(send);
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(onCreateSale).toHaveBeenCalled());
    expect(onCreateSale).toHaveBeenCalledTimes(1);
    expect(onCreateSale).toHaveBeenCalledWith(
      expect.objectContaining({ name: "phone sale", amount: 1234 }),
      expect.objectContaining({ existing: false }),
    );

    /* The sale failed: the draft stays, and send tries it again. */
    await act(async () => outcomes[0].reject(new Error("offline")));
    fireEvent.click(screen.getByRole("button", { name: "send" }));
    await waitFor(() => expect(onCreateSale).toHaveBeenCalledTimes(2));
    expect(onCreateSale).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "phone sale", amount: 1234 }),
      expect.objectContaining({ existing: false }),
    );
    await act(async () => outcomes[1].resolve());
  });
});

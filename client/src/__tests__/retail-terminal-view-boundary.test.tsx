import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("delegates paywave for an existing live transaction without recreating it locally", async () => {
    const onCreateSale = jest.fn().mockResolvedValue(undefined);
    render(<RetailTerminalView liveState={existingState} onCreateSale={onCreateSale} />);

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
});

import fs from "node:fs";
import path from "node:path";
import { configure, fireEvent, render, screen } from "@testing-library/react";
import {
  CheckoutView,
  type CheckoutPaymentViewProps,
  type CheckoutQuoteViewProps,
} from "@/features/checkout/CheckoutView";

configure({ testIdAttribute: "data-demo-id" });

const viewSourcePath = path.resolve(process.cwd(), "client/src/features/checkout/CheckoutView.tsx");
const controllerSourcePath = path.resolve(process.cwd(), "client/src/pages/checkout.tsx");
const forbidden = [
  /@tanstack\/react-query/,
  /framer-motion/,
  /@\/components\/checkout\//,
  /@\/lib\/queryClient/,
  /@\/lib\/sse-client/,
  /\bfetch\s*\(/,
  /\bapiRequest\b/,
  /\blocalStorage\b|\bsessionStorage\b/,
  /\bPaymentRequest\b|ApplePaySession|WindcavePayments/,
  /\bwindow\.(?:location|open|history)\b/,
  /\bnavigator\.(?:clipboard|share)\b/,
  /useParams|useLocation/,
];

function paymentProps(overrides: Partial<CheckoutPaymentViewProps> = {}): CheckoutPaymentViewProps {
  return {
    kind: "payment",
    itemName: "Heat pump service",
    amount: "$250",
    subtitle: "20% deposit of $1,250 total",
    isInvoice: true,
    invoiceDocumentAvailable: true,
    splitEnabled: true,
    splitActive: false,
    splitChoosing: true,
    splitBusy: false,
    splitCount: 0,
    splitPaid: 0,
    payerEmail: "",
    inAppBrowser: false,
    inAppIOS: false,
    inAppAndroid: false,
    linkCopied: false,
    applePayAvailable: true,
    googlePayAvailable: true,
    cardOpen: false,
    cardReady: false,
    status: "idle",
    onViewInvoice: jest.fn(),
    onStartSplit: jest.fn(),
    onCancelSplit: jest.fn(),
    onChooseSplit: jest.fn(),
    onPayerEmailChange: jest.fn(),
    onOpenExternalBrowser: jest.fn(),
    onCopyLink: jest.fn(),
    onApplePay: jest.fn(),
    onGooglePay: jest.fn(),
    onToggleCard: jest.fn(),
    onCardPay: jest.fn(),
    onRetry: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

function quoteProps(overrides: Partial<CheckoutQuoteViewProps> = {}): CheckoutQuoteViewProps {
  return {
    kind: "quote",
    loading: false,
    accepting: false,
    responding: false,
    step: "view",
    title: "Heat pump service",
    amount: "$1,250",
    subtitle: "20% deposit required",
    onPrimary: jest.fn(),
    onViewQuote: jest.fn(),
    onDecline: jest.fn(),
    ...overrides,
  };
}

describe("CheckoutView extraction boundary", () => {
  test("contains no production controller or external-effect capability", () => {
    const source = fs.readFileSync(viewSourcePath, "utf8");
    for (const rule of forbidden) expect(source).not.toMatch(rule);
  });

  test("delegates the real quote acceptance controls", () => {
    const onPrimary = jest.fn();
    const onViewQuote = jest.fn();
    const onDecline = jest.fn();
    const { rerender } = render(
      <CheckoutView {...quoteProps({ onPrimary, onViewQuote, onDecline })} />,
    );

    fireEvent.click(screen.getByTestId("checkout-quote-primary"));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "View quote PDF" })).not.toBeInTheDocument();

    rerender(
      <CheckoutView {...quoteProps({
        step: "confirm",
        onPrimary,
        onViewQuote,
        onDecline,
      })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View quote PDF" }));
    fireEvent.click(screen.getByTestId("checkout-quote-decline"));
    expect(onViewQuote).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  test("renders deterministic wallets, split progress, and hosted-field mounts", () => {
    const onApplePay = jest.fn();
    const onGooglePay = jest.fn();
    const onChooseSplit = jest.fn();
    const onToggleCard = jest.fn();
    const onPayerEmailChange = jest.fn();
    const { rerender } = render(
      <CheckoutView {...paymentProps({
        onApplePay,
        onGooglePay,
        onChooseSplit,
        onToggleCard,
        onPayerEmailChange,
      })} />,
    );

    fireEvent.click(screen.getByTestId("checkout-apple-pay"));
    fireEvent.click(screen.getByTestId("checkout-google-pay"));
    fireEvent.click(screen.getByTestId("checkout-split-4"));
    fireEvent.click(screen.getByTestId("checkout-card-toggle"));
    expect(onApplePay).toHaveBeenCalledTimes(1);
    expect(onGooglePay).toHaveBeenCalledTimes(1);
    expect(onChooseSplit).toHaveBeenCalledWith(4);
    expect(onToggleCard).toHaveBeenCalledTimes(1);
    expect(document.querySelector("#hf-number")).toBeInTheDocument();
    expect(document.querySelector("#hf-expiry")).toBeInTheDocument();
    expect(document.querySelector("#hf-cvv")).toBeInTheDocument();
    expect(document.querySelector("#hf-name")).toBeInTheDocument();

    rerender(
      <CheckoutView {...paymentProps({
        splitActive: true,
        splitChoosing: false,
        splitCount: 4,
        splitPaid: 1,
        payerEmail: "payer@example.test",
        onPayerEmailChange,
      })} />,
    );
    expect(screen.getByText("1 of 4 paid")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("your email (for your receipt)"), {
      target: { value: "next@example.test" },
    });
    expect(onPayerEmailChange).toHaveBeenCalledWith("next@example.test");
  });

  test("delegates in-app browser actions without owning navigation or clipboard access", () => {
    const onOpenExternalBrowser = jest.fn();
    const onCopyLink = jest.fn();
    render(
      <CheckoutView {...paymentProps({
        inAppBrowser: true,
        inAppIOS: true,
        inAppAndroid: false,
        onOpenExternalBrowser,
        onCopyLink,
      })} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open in Safari" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy payment link" }));
    expect(onOpenExternalBrowser).toHaveBeenCalledTimes(1);
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  test("keeps every production effect in the checkout adapter", () => {
    const source = fs.readFileSync(controllerSourcePath, "utf8");
    expect(source).toContain('import { CheckoutView } from "@/features/checkout/CheckoutView"');
    for (const viewKind of ['kind="quote"', 'kind="terminal"', 'kind="payment"', 'kind="loading"', 'kind="invalid"']) {
      expect(source).toContain(viewKind);
    }
    for (const capability of [
      "onApplePay={handleApplePay}",
      "onGooglePay={handleGooglePay}",
      "onCardPay={handleCardPay}",
      "onChooseSplit={setupSplit}",
      "onCancel={handleCancel}",
    ]) {
      expect(source).toContain(capability);
    }
    expect(source).toMatch(/\bfetch\s*\(/);
    expect(source).toContain("ApplePaySession");
    expect(source).toContain("WindcavePayments");
    expect(source).toContain("navigator.clipboard");
    expect(source).toContain("setLocation");
  });
});

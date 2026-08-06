import type { TutorialPageKey } from "@shared/tutorial";
import type { DeviceClass } from "@/hooks/use-device-class";

export type TutorialPlacement = "top" | "bottom" | "auto";

export interface TutorialStep {
  target: string;
  fallbackTarget?: string;
  /** Optional selector used only by the tablet/desktop layout. */
  desktopTarget?: string;
  /** Optional tablet/desktop fallback when the primary widget is conditional. */
  desktopFallbackTarget?: string;
  tag: string;
  title: string;
  body: string;
  /** Optional wording override for pointer/placement differences off mobile. */
  desktopBody?: string;
  /** Additive tablet/desktop step; never enters the mobile walkthrough. */
  desktopOnly?: boolean;
  placement?: TutorialPlacement;
}

export interface TutorialPageDefinition {
  label: string;
  steps: TutorialStep[];
}

/**
 * Resolve the additive desktop tutorial fields without mutating the registry.
 * Mobile returns the original objects and order so its walkthrough remains
 * byte-for-byte equivalent to the pre-desktop definition.
 */
export function tutorialStepsForDevice(
  pageKey: TutorialPageKey,
  deviceClass: DeviceClass,
): TutorialStep[] {
  const steps = TUTORIAL_REGISTRY[pageKey].steps;
  if (deviceClass === "mobile") return steps.filter((step) => !step.desktopOnly);
  return steps.map((step) => ({
    ...step,
    target: step.desktopTarget ?? step.target,
    fallbackTarget: step.desktopFallbackTarget ?? step.fallbackTarget,
    body: step.desktopBody ?? step.body,
  }));
}

export const TUTORIAL_REGISTRY: Record<TutorialPageKey, TutorialPageDefinition> = {
  "retail-dashboard": {
    label: "Retail dashboard",
    steps: [
      { target: '[aria-label="new sale"]', fallbackTarget: ".rd-card", desktopTarget: '[data-tutorial-id="retail-home-new-sale"]', tag: "New sale", title: "Take a payment", body: "Open the terminal from here whenever you are ready to charge a customer.", desktopBody: "Open the full desktop terminal from this shortcut whenever you are ready to start a sale." },
      { target: '[aria-label="manage stock"]', fallbackTarget: ".rd-card", desktopTarget: '[data-tutorial-id="retail-home-stock"]', tag: "Products", title: "Manage your stock", body: "Jump straight to your product list to add items or update prices.", desktopBody: "Open the desktop stock catalogue to add products, search inventory or update pricing." },
      { target: '[aria-label="view sales"]', fallbackTarget: ".rd-card", desktopTarget: '[data-tutorial-id="retail-home-sales"]', tag: "History", title: "Review your sales", body: "Open your full transaction history to check what has come in.", desktopBody: "Move into desktop analytics to review transactions, reports and exports." },
      { target: '[data-tutorial-id="retail-home-health"]', desktopTarget: '[data-tutorial-id="retail-home-health"]', tag: "Store health", title: "Spot what needs attention", body: "Store health keeps outstanding and failed payments visible without leaving the dashboard.", desktopOnly: true },
      { target: '[data-tutorial-id="retail-home-notifications"]', desktopTarget: '[data-tutorial-id="retail-home-notifications"]', tag: "Notifications", title: "Catch recent activity", body: "Open this compact feed for recent payment activity and other store updates.", desktopOnly: true },
    ],
  },
  "retail-terminal": {
    label: "Retail terminal",
    steps: [
      { target: ".tp-amount", fallbackTarget: ".tp-viewport", desktopTarget: '[data-tutorial-id="retail-terminal-amount"]', tag: "Sale amount", title: "Enter the amount", body: "Type the amount or choose stocked items to build the customer's payment.", desktopBody: "Set the sale amount here, or use the centre rail to choose an item from stock." },
      { target: ".tp-subbar", fallbackTarget: ".tp-viewport", desktopTarget: '[data-tutorial-id="retail-terminal-tools"]', tag: "Payment tools", title: "Choose how to charge", body: "Switch between payment links, boards and the other terminal options here.", desktopBody: "The centre rail moves between stock, amount entry, sharing and a fresh sale without leaving the terminal." },
      { target: '[aria-label="send"]', fallbackTarget: ".tp-viewport", desktopTarget: '[data-tutorial-id="retail-terminal-send"]', tag: "Send", title: "Create the payment", body: "When the amount is right, send it to open a live payment for the customer.", desktopBody: "Send creates the selected private-link or board payment and opens its sharing controls." },
      { target: '[data-tutorial-id="retail-terminal-live-payments"]', desktopTarget: '[data-tutorial-id="retail-terminal-live-payments"]', tag: "Live payments", title: "Track every payment", body: "The payment stack is built into the desktop terminal, so pending, paid and failed sales remain visible while you work.", desktopOnly: true },
    ],
  },
  "retail-payment-stack": {
    label: "Payment stack",
    steps: [
      { target: '[data-tutorial-id="ps-header"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="retail-terminal-live-payments"]', tag: "Live payments", title: "Track active payments", body: "Every pending and processing payment stays here while customers complete it.", desktopBody: "On desktop the payment stack lives beside the terminal, with filters for awaiting, paid and failed sales." },
      { target: '[data-tutorial-id="ps-new"]', fallbackTarget: '[data-tutorial-id="ps-header"]', desktopTarget: '[data-tutorial-id="retail-terminal-amount"]', tag: "New payment", title: "Start another payment", body: "Head back to the terminal to raise a new payment request in a couple of taps.", desktopBody: "Start the next payment in the composer alongside the stack—there is no separate desktop page to leave." },
    ],
  },
  "retail-transactions": {
    label: "Transactions",
    steps: [
      { target: '[data-tutorial-id="tx-period"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="retail-analytics-period"]', tag: "Timeframe", title: "Filter by period", body: "Switch between day, week, month and year to focus the list on a timeframe.", desktopBody: "Use the range control above the desktop chart to reframe revenue and transaction totals." },
      { target: '[data-tutorial-id="tx-history"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="retail-analytics-history"]', tag: "History", title: "Review every transaction", body: "Completed, pending and failed payments collect here. Tap any one for its receipt, refund and share options.", desktopBody: "Expand the payment-history sheet, then select a row for receipt, sharing and refund actions." },
      { target: '[data-tutorial-id="tx-export"]', fallbackTarget: '[data-tutorial-id="tx-history"]', desktopTarget: '[data-tutorial-id="retail-analytics-export"]', tag: "Export", title: "Download your records", body: "Export the period as a PDF, CSV or Xero-ready file for your accounts.", desktopBody: "Export the desktop view as PDF, CSV or Xero-ready data for your accounts." },
    ],
  },
  "retail-stock": {
    label: "Stock",
    steps: [
      { target: '[data-testid="button-add-product"]', fallbackTarget: "button", desktopTarget: '[data-tutorial-id="retail-stock-add"]', tag: "Add product", title: "Build your product list", body: "Add a product, price and any variations so it can be picked quickly in the terminal.", desktopBody: "Use the add tile to create a product, price and description for the desktop terminal." },
      { target: '[data-testid="input-search"]', fallbackTarget: '[data-testid^="card-product-"]', desktopTarget: '[data-tutorial-id="retail-stock-directory"]', tag: "Find & edit", title: "Keep stock organised", body: "Search the catalogue, then tap a product card whenever its details or price need changing.", desktopBody: "Search and sort the catalogue here, then open any product tile to update it." },
    ],
  },
  "retail-nfc": {
    label: "NFC payment",
    steps: [
      { target: '[data-tutorial-id="nfc-amount"]', fallbackTarget: "main", tag: "Amount", title: "Set the amount", body: "Enter what the customer owes before starting the contactless payment." },
      { target: '[data-tutorial-id="nfc-item"]', fallbackTarget: "main", tag: "Item", title: "Describe the sale", body: "Add a short item name so the payment and receipt are easy to recognise." },
      { target: '[data-tutorial-id="nfc-create"]', fallbackTarget: "main", tag: "Tap to pay", title: "Take the payment", body: "Start the terminal, then have the customer tap their card or wallet to pay." },
    ],
  },
  "payment-board-builder": {
    label: "Payment board builder",
    steps: [
      { target: '[data-tutorial-id="bb-preview"]', fallbackTarget: "main", tag: "Live preview", title: "See it as you build", body: "This preview updates instantly as you design the printed sign customers scan." },
      { target: '[data-tutorial-id="bb-qr"]', fallbackTarget: "main", tag: "Payment QR", title: "Choose what they scan", body: "Point the board at your main payment link or a specific Tapt Stone." },
      { target: '[data-tutorial-id="bb-colour"]', fallbackTarget: "main", tag: "Branding", title: "Match your brand", body: "Set the accent, background and text colours, or drop in a background image." },
      { target: '[data-tutorial-id="bb-text"]', fallbackTarget: "main", tag: "Wording", title: "Add your words", body: "Set the business name, tagline, pay instruction and footer note shown on the board." },
      { target: '[data-tutorial-id="bb-submit"]', fallbackTarget: "main", tag: "Print", title: "Send it to print", body: "Add your name and email, then submit and we'll email a print-ready PDF." },
    ],
  },
  settings: {
    label: "Settings",
    steps: [
      { target: '[data-tutorial-id="set-business"]', fallbackTarget: '[data-testid="input-business-name"]', tag: "Business", title: "Keep your details current", body: "Update your business name, director, address and GST details from this section." },
      { target: '[data-tutorial-id="set-goal"]', fallbackTarget: '[data-testid="input-daily-goal"]', tag: "Daily goal", title: "Set a daily target", body: "Choose a daily sales goal so your dashboard can track progress against it." },
      { target: '[data-settings-section="billing"]', fallbackTarget: '[data-testid="button-customer-page"]', tag: "Payment card", title: "Keep payments ready", body: "A valid credit or debit card is required here before any payment request can be sent." },
      { target: '[data-testid="button-customer-page"]', fallbackTarget: '[data-settings-section="billing"]', tag: "Your page", title: "Share your payment page", body: "Open the public customer page you can print or link so customers can pay you." },
      { target: '[data-tutorial-id="settings-tutorial-help"]', fallbackTarget: '[data-testid="button-logout"]', tag: "Tutorial & help", title: "Restart whenever you need", body: "You can restart every page tutorial here without changing any of your business data." },
    ],
  },
  "property-dashboard": {
    label: "Property dashboard",
    steps: [
      { target: '[aria-label="set up rent payment"]', fallbackTarget: ".pd-card", desktopTarget: '[data-tutorial-id="property-home-rent"]', tag: "Rent request", title: "Set up a rent request", body: "Start a tenant payment from this shortcut and choose the amount and delivery details.", desktopBody: "Open the desktop property terminal to choose a tenant, amount, frequency and delivery channel." },
      { target: '[aria-label="send reminder"]', fallbackTarget: ".pd-card", desktopTarget: '[data-tutorial-id="property-home-reminder"]', tag: "Reminders", title: "Chase outstanding rent", body: "Send a reminder to a tenant whose rent is still outstanding.", desktopBody: "Jump to the terminal workflow for following up an outstanding tenant payment." },
      { target: '[aria-label="send expense"]', fallbackTarget: ".pd-card", desktopTarget: '[data-tutorial-id="property-home-expense"]', tag: "Expenses", title: "Pass on an expense", body: "Send a tenant an expense such as a repair or utility charge.", desktopBody: "Open the bill workflow for repairs, utilities and other tenant expenses." },
      { target: '[data-tutorial-id="property-home-health"]', desktopTarget: '[data-tutorial-id="property-home-health"]', tag: "Portfolio health", title: "See what needs attention", body: "Portfolio health keeps due, overdue and failed tenant payments visible at a glance.", desktopOnly: true },
      { target: '[data-tutorial-id="property-home-notifications"]', desktopTarget: '[data-tutorial-id="property-home-notifications"]', tag: "Notifications", title: "Catch recent activity", body: "Open the compact feed for recent rent, expense and tenant-payment updates.", desktopOnly: true },
    ],
  },
  "property-tenants": {
    label: "Tenant directory",
    steps: [
      { target: '[aria-label="Add tenant"]', fallbackTarget: ".tdir-add", desktopTarget: '[data-tutorial-id="property-directory-add"]', tag: "Add tenant", title: "Create a tenant profile", body: "Save the tenant, property and preferred contact channel before sending rent requests.", desktopBody: "Add the tenant, property and delivery preference without leaving the desktop directory." },
      { target: 'input[placeholder*="search tenants"]', fallbackTarget: ".tdir-list", desktopTarget: '[data-tutorial-id="property-directory-search"]', tag: "Directory", title: "Find tenants quickly", body: "Search by tenant or address, then open a profile to review its payment activity.", desktopBody: "Search the full-width directory by tenant or property, then open a row for its details." },
    ],
  },
  "property-tenant-profile": {
    label: "Tenant profile",
    steps: [
      { target: '[data-tutorial-id="tenant-edit"]', fallbackTarget: '[aria-label="Edit tenant"]', tag: "Tenant details", title: "Keep contact details current", body: "Use the edit control to update the property, contact channel or tenant information." },
      { target: '[data-tutorial-id="tenant-activity"]', fallbackTarget: "main", tag: "Activity", title: "See the complete payment story", body: "Invoices, reminders and payments appear chronologically in the activity timeline." },
    ],
  },
  "property-terminal": {
    label: "Property terminal",
    steps: [
      { target: '[aria-label="new rent request"]', fallbackTarget: ".tp-pfab", desktopTarget: '[data-tutorial-id="property-terminal-request"]', tag: "New request", title: "Start with the plus button", body: "Choose a tenant and create a rent request, expense or other property payment.", desktopBody: "The desktop composer keeps the selected tenant, amount and rent frequency together." },
      { target: ".tp-subbar", fallbackTarget: ".tp-viewport", desktopTarget: '[data-tutorial-id="property-terminal-tools"]', tag: "Property tools", title: "Move between payment actions", body: "The action bar gives you tenant, rent, expense and externally-paid workflows without leaving this page.", desktopBody: "Use the centre rail for tenant selection, rent requests, bills and externally received payments." },
      { target: '[aria-label="send"]', fallbackTarget: ".tp-viewport", desktopTarget: '[data-tutorial-id="property-terminal-send"]', tag: "Send", title: "Send it to the tenant", body: "Once the request is ready, send it to the tenant through their chosen channel.", desktopBody: "Send delivers the request using the selected tenant's saved email or phone channel." },
    ],
  },
  "property-analytics": {
    label: "Property analytics",
    steps: [
      { target: '[data-tutorial-id="pa-period"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="pa-period"]', tag: "Timeframe", title: "Choose the period", body: "Switch between day, week, month and year to reframe the figures below.", desktopBody: "Use the range control above the desktop chart to reframe the whole portfolio view." },
      { target: '[data-tutorial-id="pa-total"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="pa-total"]', tag: "Revenue", title: "See rent collected", body: "The headline total and chart show what you have collected across the period.", desktopBody: "The headline, growth comparison and chart summarise collected rent for the selected range." },
      { target: '[data-tutorial-id="pa-history"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="pa-history"]', tag: "History", title: "Review every payment", body: "Paid, outstanding and failed rent payments are listed here, newest first.", desktopBody: "Expand the lower sheet to inspect tenant payments and their current status." },
      { target: '[data-tutorial-id="pa-reports"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="pa-reports"]', tag: "Reports", title: "Export a report", body: "Create a downloadable property report for the selected period when you need one.", desktopBody: "Open desktop reports from the history sheet, then apply the period and property filters you need." },
    ],
  },
  "trades-dashboard": {
    label: "Trades dashboard",
    steps: [
      { target: '[data-tutorial-id="trades-home-health"]', fallbackTarget: ".td-card", desktopTarget: '[data-tutorial-id="trades-home-health"]', tag: "Jobs overview", title: "See revenue and active work", body: "The dashboard combines collection performance, clients and outstanding job activity.", desktopBody: "Business health keeps overdue invoices, open quotes and active work visible beside revenue." },
      { target: '[data-tutorial-id="trades-home-actions"]', fallbackTarget: ".td-tap", desktopTarget: '[data-tutorial-id="trades-home-actions"]', tag: "Shortcuts", title: "Jump into the next job", body: "Use the action cards to create invoices, quotes and client work more quickly.", desktopBody: "Use these desktop shortcuts for a quote, quick invoice or recurring job." },
      { target: '[data-tutorial-id="trades-home-notifications"]', desktopTarget: '[data-tutorial-id="trades-home-notifications"]', tag: "Notifications", title: "Catch recent job activity", body: "Open this compact feed for recent quote, invoice and client-payment updates.", desktopOnly: true },
    ],
  },
  "trades-clients": {
    label: "Client directory",
    steps: [
      { target: '[aria-label="Add client"]', fallbackTarget: ".cdir-add", desktopTarget: '[data-tutorial-id="trades-directory-add"]', tag: "Add client", title: "Create a client profile", body: "Store the client, site and preferred delivery channel before invoicing.", desktopBody: "Add the client, job site and preferred invoice channel from the desktop directory." },
      { target: 'input[placeholder*="search clients"]', fallbackTarget: ".cdir-list", desktopTarget: '[data-tutorial-id="trades-directory-search"]', tag: "Directory", title: "Find active work", body: "Search by client or site, then open the profile for its quotes, invoices and timeline.", desktopBody: "Search by client or site, then open a full-width row to continue the job." },
    ],
  },
  "trades-client-profile": {
    label: "Client profile",
    steps: [
      { target: '[aria-label="Edit client"]', fallbackTarget: '[data-tutorial-id="client-activity"]', tag: "Client details", title: "Keep the job contact current", body: "Update site details, delivery preferences or archive a client from the edit sheet." },
      { target: '[data-tutorial-id="client-activity"]', fallbackTarget: "main", tag: "Job activity", title: "Track the client history", body: "Quotes, invoices, recurring work and payments appear together in this timeline." },
    ],
  },
  "trades-terminal": {
    label: "Trades terminal",
    steps: [
      { target: '[aria-label="new invoice"]', fallbackTarget: ".tp-pfab", desktopTarget: '[data-tutorial-id="trades-terminal-invoice"]', tag: "New invoice", title: "Start a job payment", body: "Use the plus button for a client invoice or a quick invoice when the client is not saved yet.", desktopBody: "The desktop composer keeps the client, amount and invoice type together for the current job." },
      { target: ".tp-subbar", fallbackTarget: ".tp-viewport", desktopTarget: '[data-tutorial-id="trades-terminal-tools"]', tag: "Job tools", title: "Invoices, quotes and external payments", body: "The action bar moves between the main job-payment tools while keeping you on the terminal.", desktopBody: "Use the centre rail to choose a client, create an invoice or quote, and record external payment." },
      { target: '[aria-label="send"]', fallbackTarget: ".tp-viewport", desktopTarget: '[data-tutorial-id="trades-terminal-send"]', tag: "Send", title: "Send the invoice", body: "When the invoice is ready, send it to the client through their chosen channel.", desktopBody: "Send delivers the invoice using the client's saved email or phone preference." },
    ],
  },
  "trades-quote": {
    label: "Quote builder",
    steps: [
      { target: 'input[aria-label^="Item"]', fallbackTarget: '[data-tutorial-id="tq-totals"]', tag: "Line items", title: "Build the quote", body: "Add descriptions, quantities and prices. Add a line for each part of the job." },
      { target: '[data-tutorial-id="tq-deposit"]', fallbackTarget: '[data-tutorial-id="tq-totals"]', tag: "Deposit", title: "Ask for a deposit", body: "Optionally require a percentage or fixed deposit before the work begins." },
      { target: '[data-tutorial-id="tq-totals"]', fallbackTarget: "main", tag: "Totals", title: "Check GST and totals", body: "Review the subtotal, GST and final total before you send the quote." },
      { target: '[data-tutorial-id="tq-create"]', fallbackTarget: "main", tag: "Create quote", title: "Send it to the client", body: "When every detail is right, create the quote to send it for acceptance." },
    ],
  },
  "trades-recurring": {
    label: "Recurring invoices",
    steps: [
      { target: '[data-tutorial-id="tr-create"]', fallbackTarget: "main", tag: "New schedule", title: "Set up repeat work", body: "Pick a client, amount, frequency and delivery channel to invoice retainers automatically." },
      { target: '[data-tutorial-id="tr-reminders"]', fallbackTarget: '[role="switch"]', tag: "Reminders", title: "Chase overdue invoices", body: "Turn automatic overdue reminders on or off without touching the schedules themselves." },
      { target: '[data-tutorial-id="tr-schedules"]', fallbackTarget: "main", tag: "Schedules", title: "Manage repeat invoices", body: "Every active schedule sits here so you can pause, resume or cancel it any time." },
    ],
  },
  "trades-analytics": {
    label: "Trades analytics",
    steps: [
      { target: '[data-tutorial-id="ta-period"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="ta-period"]', tag: "Timeframe", title: "Choose the period", body: "Switch between day, week, month and year to reframe the figures below.", desktopBody: "Use the range control above the desktop chart to reframe revenue and job totals." },
      { target: '[data-tutorial-id="ta-total"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="ta-total"]', tag: "Revenue", title: "See job collections", body: "The headline total and chart show what you have collected across the period.", desktopBody: "The headline, growth comparison and chart summarise client collections for the selected range." },
      { target: '[data-tutorial-id="ta-history"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="ta-history"]', tag: "History", title: "Review every payment", body: "Paid, outstanding and failed job payments are listed here, newest first.", desktopBody: "Expand the lower sheet to inspect invoices, quotes and their latest status." },
      { target: '[data-tutorial-id="ta-reports"]', fallbackTarget: "main", desktopTarget: '[data-tutorial-id="ta-reports"]', tag: "Reports", title: "Export a report", body: "Create a downloadable trades report for the selected period when you need one.", desktopBody: "Open desktop reports from the history sheet, then apply the period and client filters you need." },
    ],
  },
};

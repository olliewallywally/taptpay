import type { TutorialPageKey } from "@shared/tutorial";

export type TutorialPlacement = "top" | "bottom" | "auto";

export interface TutorialStep {
  target: string;
  fallbackTarget?: string;
  tag: string;
  title: string;
  body: string;
  placement?: TutorialPlacement;
}

export interface TutorialPageDefinition {
  label: string;
  steps: TutorialStep[];
}

export const TUTORIAL_REGISTRY: Record<TutorialPageKey, TutorialPageDefinition> = {
  "retail-dashboard": {
    label: "Retail dashboard",
    steps: [
      { target: '[aria-label="new sale"]', fallbackTarget: ".rd-card", tag: "New sale", title: "Take a payment", body: "Open the terminal from here whenever you are ready to charge a customer." },
      { target: '[aria-label="manage stock"]', fallbackTarget: ".rd-card", tag: "Products", title: "Manage your stock", body: "Jump straight to your product list to add items or update prices." },
      { target: '[aria-label="view sales"]', fallbackTarget: ".rd-card", tag: "History", title: "Review your sales", body: "Open your full transaction history to check what has come in." },
    ],
  },
  "retail-terminal": {
    label: "Retail terminal",
    steps: [
      { target: ".tp-amount", fallbackTarget: ".tp-viewport", tag: "Sale amount", title: "Enter the amount", body: "Type the amount or choose stocked items to build the customer's payment." },
      { target: ".tp-subbar", fallbackTarget: ".tp-viewport", tag: "Payment tools", title: "Choose how to charge", body: "Switch between payment links, boards and the other terminal options here." },
      { target: '[aria-label="send"]', fallbackTarget: ".tp-viewport", tag: "Send", title: "Create the payment", body: "When the amount is right, send it to open a live payment for the customer." },
    ],
  },
  "retail-payment-stack": {
    label: "Payment stack",
    steps: [
      { target: '[data-tutorial-id="ps-header"]', fallbackTarget: "main", tag: "Live payments", title: "Track active payments", body: "Every pending and processing payment stays here while customers complete it." },
      { target: '[data-tutorial-id="ps-new"]', fallbackTarget: '[data-tutorial-id="ps-header"]', tag: "New payment", title: "Start another payment", body: "Head back to the terminal to raise a new payment request in a couple of taps." },
    ],
  },
  "retail-transactions": {
    label: "Transactions",
    steps: [
      { target: '[data-tutorial-id="tx-period"]', fallbackTarget: "main", tag: "Timeframe", title: "Filter by period", body: "Switch between day, week, month and year to focus the list on a timeframe." },
      { target: '[data-tutorial-id="tx-history"]', fallbackTarget: "main", tag: "History", title: "Review every transaction", body: "Completed, pending and failed payments collect here. Tap any one for its receipt, refund and share options." },
      { target: '[data-tutorial-id="tx-export"]', fallbackTarget: '[data-tutorial-id="tx-history"]', tag: "Export", title: "Download your records", body: "Export the period as a PDF, CSV or Xero-ready file for your accounts." },
    ],
  },
  "retail-stock": {
    label: "Stock",
    steps: [
      { target: '[data-testid="button-add-product"]', fallbackTarget: "button", tag: "Add product", title: "Build your product list", body: "Add a product, price and any variations so it can be picked quickly in the terminal." },
      { target: '[data-testid="input-search"]', fallbackTarget: '[data-testid^="card-product-"]', tag: "Find & edit", title: "Keep stock organised", body: "Search the catalogue, then tap a product card whenever its details or price need changing." },
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
      { target: '[aria-label="set up rent payment"]', fallbackTarget: ".pd-card", tag: "Rent request", title: "Set up a rent request", body: "Start a tenant payment from this shortcut and choose the amount and delivery details." },
      { target: '[aria-label="send reminder"]', fallbackTarget: ".pd-card", tag: "Reminders", title: "Chase outstanding rent", body: "Send a reminder to a tenant whose rent is still outstanding." },
      { target: '[aria-label="send expense"]', fallbackTarget: ".pd-card", tag: "Expenses", title: "Pass on an expense", body: "Send a tenant an expense such as a repair or utility charge." },
    ],
  },
  "property-tenants": {
    label: "Tenant directory",
    steps: [
      { target: '[aria-label="Add tenant"]', fallbackTarget: ".tdir-add", tag: "Add tenant", title: "Create a tenant profile", body: "Save the tenant, property and preferred contact channel before sending rent requests." },
      { target: 'input[placeholder*="search tenants"]', fallbackTarget: ".tdir-list", tag: "Directory", title: "Find tenants quickly", body: "Search by tenant or address, then open a profile to review its payment activity." },
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
      { target: '[aria-label="new rent request"]', fallbackTarget: ".tp-pfab", tag: "New request", title: "Start with the plus button", body: "Choose a tenant and create a rent request, expense or other property payment." },
      { target: ".tp-subbar", fallbackTarget: ".tp-viewport", tag: "Property tools", title: "Move between payment actions", body: "The action bar gives you tenant, rent, expense and externally-paid workflows without leaving this page." },
      { target: '[aria-label="send"]', fallbackTarget: ".tp-viewport", tag: "Send", title: "Send it to the tenant", body: "Once the request is ready, send it to the tenant through their chosen channel." },
    ],
  },
  "property-analytics": {
    label: "Property analytics",
    steps: [
      { target: '[data-tutorial-id="pa-period"]', fallbackTarget: "main", tag: "Timeframe", title: "Choose the period", body: "Switch between day, week, month and year to reframe the figures below." },
      { target: '[data-tutorial-id="pa-total"]', fallbackTarget: "main", tag: "Revenue", title: "See rent collected", body: "The headline total and chart show what you have collected across the period." },
      { target: '[data-tutorial-id="pa-history"]', fallbackTarget: "main", tag: "History", title: "Review every payment", body: "Paid, outstanding and failed rent payments are listed here, newest first." },
      { target: '[data-tutorial-id="pa-reports"]', fallbackTarget: "main", tag: "Reports", title: "Export a report", body: "Create a downloadable property report for the selected period when you need one." },
    ],
  },
  "trades-dashboard": {
    label: "Trades dashboard",
    steps: [
      { target: '[data-tutorial-id="trades-home-health"]', fallbackTarget: ".td-card", tag: "Jobs overview", title: "See revenue and active work", body: "The dashboard combines collection performance, clients and outstanding job activity." },
      { target: '[data-tutorial-id="trades-home-actions"]', fallbackTarget: ".td-tap", tag: "Shortcuts", title: "Jump into the next job", body: "Use the action cards to create invoices, quotes and client work more quickly." },
    ],
  },
  "trades-clients": {
    label: "Client directory",
    steps: [
      { target: '[aria-label="Add client"]', fallbackTarget: ".cdir-add", tag: "Add client", title: "Create a client profile", body: "Store the client, site and preferred delivery channel before invoicing." },
      { target: 'input[placeholder*="search clients"]', fallbackTarget: ".cdir-list", tag: "Directory", title: "Find active work", body: "Search by client or site, then open the profile for its quotes, invoices and timeline." },
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
      { target: '[aria-label="new invoice"]', fallbackTarget: ".tp-pfab", tag: "New invoice", title: "Start a job payment", body: "Use the plus button for a client invoice or a quick invoice when the client is not saved yet." },
      { target: ".tp-subbar", fallbackTarget: ".tp-viewport", tag: "Job tools", title: "Invoices, quotes and external payments", body: "The action bar moves between the main job-payment tools while keeping you on the terminal." },
      { target: '[aria-label="send"]', fallbackTarget: ".tp-viewport", tag: "Send", title: "Send the invoice", body: "When the invoice is ready, send it to the client through their chosen channel." },
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
      { target: '[data-tutorial-id="ta-period"]', fallbackTarget: "main", tag: "Timeframe", title: "Choose the period", body: "Switch between day, week, month and year to reframe the figures below." },
      { target: '[data-tutorial-id="ta-total"]', fallbackTarget: "main", tag: "Revenue", title: "See job collections", body: "The headline total and chart show what you have collected across the period." },
      { target: '[data-tutorial-id="ta-history"]', fallbackTarget: "main", tag: "History", title: "Review every payment", body: "Paid, outstanding and failed job payments are listed here, newest first." },
      { target: '[data-tutorial-id="ta-reports"]', fallbackTarget: "main", tag: "Reports", title: "Export a report", body: "Create a downloadable trades report for the selected period when you need one." },
    ],
  },
};

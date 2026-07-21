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
      { target: '[aria-label="new sale"]', fallbackTarget: ".rd-card", tag: "Start here", title: "Create a new sale", body: "Open the terminal from here whenever you are ready to take a payment." },
      { target: '[aria-label="manage stock"]', fallbackTarget: '[aria-label="view sales"]', tag: "Shortcuts", title: "Your everyday tools", body: "Manage products or jump into your sales history without hunting through menus." },
    ],
  },
  "retail-terminal": {
    label: "Retail terminal",
    steps: [
      { target: ".tp-amount", fallbackTarget: ".tp-viewport", tag: "Sale amount", title: "Build the payment", body: "Enter the amount or choose stocked items to prepare the customer payment." },
      { target: ".tp-subbar", fallbackTarget: '[aria-label="send"]', tag: "Payment tools", title: "Choose how to take payment", body: "Use these controls for payment links, boards and the available terminal options." },
    ],
  },
  "retail-payment-stack": {
    label: "Payment stack",
    steps: [
      { target: "h1", fallbackTarget: "main", tag: "Payment stack", title: "Track active payments", body: "This view keeps payment requests together while customers complete them." },
      { target: "button", fallbackTarget: "main", tag: "Actions", title: "Manage a request", body: "Select a payment to view its status or use the available request actions." },
    ],
  },
  "retail-transactions": {
    label: "Transactions",
    steps: [
      { target: "h2", fallbackTarget: "main", tag: "History", title: "Review every transaction", body: "Completed, pending and failed transactions are collected here for quick checking." },
      { target: "button", fallbackTarget: "main", tag: "Reports", title: "Filter and export", body: "Use the report controls to narrow the period and download the records you need." },
    ],
  },
  "retail-stock": {
    label: "Stock",
    steps: [
      { target: '[data-testid="button-add-product"]', fallbackTarget: "button", tag: "Add product", title: "Create your product list", body: "Add a product, price and any variations so it can be selected quickly in the terminal." },
      { target: '[data-testid="input-search"]', fallbackTarget: '[data-testid^="card-product-"]', tag: "Find & edit", title: "Keep stock organised", body: "Search the catalogue, then tap a product card whenever its details or price need changing." },
    ],
  },
  "retail-nfc": {
    label: "NFC payment",
    steps: [
      { target: "h1", fallbackTarget: "main", tag: "NFC terminal", title: "Take a contactless payment", body: "This screen guides a supported device through a secure tap-to-pay transaction." },
      { target: "button", fallbackTarget: "main", tag: "Ready", title: "Follow the device prompts", body: "Start only when the amount is correct and the customer is ready with their card or wallet." },
    ],
  },
  "payment-board-builder": {
    label: "Payment board builder",
    steps: [
      { target: "h1", fallbackTarget: "main", tag: "Live preview", title: "Design your payment board", body: "Build a branded sign customers can scan to open your secure payment page." },
      { target: "button", fallbackTarget: "main", tag: "Customise", title: "Choose the layout and finish", body: "Adjust the QR code, colours, logo and wording, then submit when the preview is right." },
    ],
  },
  settings: {
    label: "Settings",
    steps: [
      { target: '[data-settings-section="billing"]', fallbackTarget: '[data-testid="button-customer-page"]', tag: "Payment card", title: "Keep payments ready", body: "A valid credit or debit card is required here before any payment request can be sent." },
      { target: '[data-tutorial-id="settings-tutorial-help"]', fallbackTarget: '[data-testid="button-logout"]', tag: "Tutorial & help", title: "Restart whenever you need", body: "You can restart every page tutorial here without changing any of your business data." },
    ],
  },
  "property-dashboard": {
    label: "Property dashboard",
    steps: [
      { target: '[aria-label="set up rent payment"]', fallbackTarget: ".pd-card", tag: "Rent payment", title: "Set up a rent request", body: "Start a tenant payment from this shortcut and choose the amount and delivery details." },
      { target: '[aria-label="send reminder"]', fallbackTarget: '[aria-label="send expense"]', tag: "Follow up", title: "Stay on top of outstanding rent", body: "Send reminders or expenses directly from the property dashboard." },
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
      { target: "button", fallbackTarget: "main", tag: "Tenant details", title: "Keep contact details current", body: "Use the edit control to update the property, contact channel or tenant information." },
      { target: '[data-tutorial-id="tenant-activity"]', fallbackTarget: "main", tag: "Activity", title: "See the complete payment story", body: "Invoices, reminders and payments appear chronologically in the activity timeline." },
    ],
  },
  "property-terminal": {
    label: "Property terminal",
    steps: [
      { target: ".tp-pfab", fallbackTarget: ".tp-viewport", tag: "New request", title: "Start with the plus button", body: "Choose a tenant and create a rent request, expense or other property payment." },
      { target: ".tp-subbar", fallbackTarget: ".tp-viewport", tag: "Property tools", title: "Move between payment actions", body: "The action bar gives you tenant, rent, expense and externally-paid workflows without leaving this page." },
    ],
  },
  "property-analytics": {
    label: "Property analytics",
    steps: [
      { target: "h2", fallbackTarget: "main", tag: "Payment history", title: "Review rent performance", body: "Use the chart and period controls to understand collections and outstanding payments." },
      { target: "button", fallbackTarget: "main", tag: "Reports", title: "Create a property report", body: "Open reports when you need a downloadable summary for a selected period." },
    ],
  },
  "trades-dashboard": {
    label: "Trades dashboard",
    steps: [
      { target: ".td-card", fallbackTarget: "main", tag: "Jobs overview", title: "See revenue and active work", body: "The dashboard combines collection performance, clients and outstanding job activity." },
      { target: ".td-tap", fallbackTarget: "button", tag: "Shortcuts", title: "Jump into the next job", body: "Use the action cards to create invoices, quotes and client work more quickly." },
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
      { target: '[aria-label="Edit client"]', fallbackTarget: "button", tag: "Client details", title: "Keep the job contact current", body: "Update site details, delivery preferences or archive a client from the edit sheet." },
      { target: '[data-tutorial-id="client-activity"]', fallbackTarget: "main", tag: "Job activity", title: "Track the client history", body: "Quotes, invoices, recurring work and payments appear together in this timeline." },
    ],
  },
  "trades-terminal": {
    label: "Trades terminal",
    steps: [
      { target: ".tp-pfab", fallbackTarget: ".tp-viewport", tag: "New invoice", title: "Start a job payment", body: "Use the plus button for a client invoice or a quick invoice when the client is not saved yet." },
      { target: ".tp-subbar", fallbackTarget: ".tp-viewport", tag: "Job tools", title: "Invoices, quotes and external payments", body: "The action bar moves between the main job-payment tools while keeping you on the terminal." },
    ],
  },
  "trades-quote": {
    label: "Quote builder",
    steps: [
      { target: 'input[aria-label^="Item"]', fallbackTarget: "input, textarea", tag: "Line items", title: "Build the quote", body: "Add descriptions, quantities and prices. Totals update as the quote takes shape." },
      { target: "button", fallbackTarget: "main", tag: "Create quote", title: "Review before sending", body: "Confirm deposits, GST and notes, then create the quote when every detail is correct." },
    ],
  },
  "trades-recurring": {
    label: "Recurring invoices",
    steps: [
      { target: '[role="switch"]', fallbackTarget: "button", tag: "Reminders", title: "Control recurring reminders", body: "Turn job reminders on or off without changing the recurring invoice schedules themselves." },
      { target: "button", fallbackTarget: "main", tag: "Schedules", title: "Create and manage repeat work", body: "Set the client, amount and frequency, then pause, resume or cancel individual schedules here." },
    ],
  },
  "trades-analytics": {
    label: "Trades analytics",
    steps: [
      { target: "h2", fallbackTarget: "main", tag: "Payment history", title: "Understand job collections", body: "Use the chart and timeframe controls to compare revenue and payment activity." },
      { target: "button", fallbackTarget: "main", tag: "Reports", title: "Export a trades report", body: "Open reports for a downloadable view of the selected period and site." },
    ],
  },
};


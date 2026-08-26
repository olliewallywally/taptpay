import type { ReactElement, ReactNode } from "react";

import RetailTerminalViewCore from "./RetailTerminalViewCore.jsx";
import "../terminal-keyframes.css";
import "../terminal-tokens.css";
import "./retail-terminal-view.css";

export type RetailTerminalStatus =
  | "awaiting payment"
  | "processing"
  | "paid"
  | "completed"
  | "declined"
  | "failed"
  | "hold"
  | "sent"
  | string;

export interface RetailTerminalItem {
  id: string | number;
  name?: string;
  itemName?: string;
  amount: number;
  status?: RetailTerminalStatus;
  splitEnabled?: boolean;
  isSplit?: boolean;
  completedSplits?: number;
  totalSplits?: number;
  paymentMethod?: string;
  createdAt?: string | Date;
}

export interface RetailTerminalState {
  items: RetailTerminalItem[];
  pending: RetailTerminalItem | null;
  sent: RetailTerminalItem[];
}

export interface RetailSaleDraft {
  name: string;
  amount: number;
  splitEnabled?: boolean;
  splitParts?: number;
}

export interface RetailStockPick {
  id: string | number;
  name: string;
  amount: number;
  qty: number;
}

export type RetailShareChannel = "copy" | "email" | "sms" | "download-qr";

export interface RetailShareIntent {
  kind: "payment" | "receipt";
  channel: RetailShareChannel;
  url: string;
  amountCents: number;
  label: string;
}

export interface RetailRefundIntent {
  transactionId: string | number;
  refundAmount: string;
  refundReason: string;
  refundMethod: "original_payment_method";
}

export interface RetailCreateOptions {
  paywave: boolean;
  existing: boolean;
}

export type RetailNavigationTarget = "home" | "stock" | "terminal" | "analytics" | "settings";

export interface RetailStone {
  id: number;
  name: string;
  stoneNumber: number;
}

export interface RetailSuccessNotification {
  id: string;
  message: string;
  amount?: string;
}

export interface RetailTerminalViewProps {
  liveState?: RetailTerminalState | null;
  onCreateSale?: (draft: RetailSaleDraft, options: RetailCreateOptions) => void | Promise<void>;
  onCreateSplit?: (draft: RetailSaleDraft, options: RetailCreateOptions) => void | Promise<void>;
  onCancel?: (transaction: RetailTerminalItem) => void | Promise<void>;
  onPickStock?: (items: RetailStockPick[]) => void | Promise<void>;
  onShare?: (intent: RetailShareIntent) => void | Promise<void>;
  onCashSale?: (draft: RetailSaleDraft) => void | Promise<void>;
  onRefund?: (intent: RetailRefundIntent) => void | Promise<void>;
  onOpenReceipt?: (transaction: RetailTerminalItem) => void | Promise<void>;
  onNavigate?: (destination: RetailNavigationTarget) => boolean | void;
  onBoardSelect?: (stoneId: number) => void;
  selectedStoneId?: number | null;
  onStoneCreate?: () => void | Promise<unknown>;
  onStoneRename?: (stoneId: number, name: string) => void | Promise<unknown>;
  onStoneDelete?: (stoneId: number) => void | Promise<unknown>;
  liveStones?: RetailStone[] | null;
  livePayLink?: string | null;
  qrElement?: ReactNode;
  showPaywave?: boolean;
  successNotification?: RetailSuccessNotification | null;
  /* Phase D of docs/PLAN-2026-08-17-terminal-panels-and-dock.md. Gated so the
     landing demo and the desktop app, which mount this same view, never drive
     the real dock (mirrors Phase A's placement === "fixed" gate). Default
     false. */
  publishDockState?: boolean;
}

/**
 * Shared retail terminal presentation/state-machine boundary.
 *
 * Network, auth, routing, storage, provider and browser-share effects are all
 * supplied by the owning controller through the capability props above.
 */
export function RetailTerminalView(props: RetailTerminalViewProps): ReactElement {
  return <RetailTerminalViewCore {...props} />;
}

export default RetailTerminalView;

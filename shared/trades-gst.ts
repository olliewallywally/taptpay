export const GST_RATE = 0.15;

export type GstMode = "inclusive" | "exclusive";

export interface QuoteLine {
  qty: number;
  unitPriceCents: number;
}

export interface QuoteTotalsInput {
  gstRegistered: boolean;
  gstMode: GstMode;
  depositEnabled?: boolean;
  depositType?: "percent" | "fixed" | string;
  depositValue?: number | null;
}

export interface QuoteTotals {
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  depositCents: number | null;
}

export function computeQuoteTotals(
  lines: QuoteLine[],
  opts: QuoteTotalsInput,
): QuoteTotals {
  const lineSum = lines.reduce(
    (sum, line) => sum + Math.round(line.qty * line.unitPriceCents),
    0,
  );

  let subtotalCents: number;
  let gstCents: number;
  let totalCents: number;

  if (!opts.gstRegistered) {
    subtotalCents = lineSum;
    gstCents = 0;
    totalCents = lineSum;
  } else if (opts.gstMode === "exclusive") {
    subtotalCents = lineSum;
    gstCents = Math.round(lineSum * GST_RATE);
    totalCents = subtotalCents + gstCents;
  } else {
    totalCents = lineSum;
    gstCents = Math.round(totalCents - totalCents / (1 + GST_RATE));
    subtotalCents = totalCents - gstCents;
  }

  let depositCents: number | null = null;
  if (opts.depositEnabled && opts.depositType && opts.depositValue != null) {
    depositCents =
      opts.depositType === "percent"
        ? Math.round(
            totalCents *
              (Math.min(100, Math.max(0, opts.depositValue)) / 100),
          )
        : Math.min(Math.max(0, opts.depositValue), totalCents);
  }

  return { subtotalCents, gstCents, totalCents, depositCents };
}

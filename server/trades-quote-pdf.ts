import { jsPDF } from "jspdf";

const money = (cents: number) =>
  new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
  }).format((cents || 0) / 100);

const fmtDate = (value: Date | string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-NZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

const safe = (value: unknown) => String(value ?? "").trim();

export function generateQuotePdf(
  quote: any,
  client: any,
  merchant: any,
  baseUrl: string,
): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin;

  const ensure = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const text = (
    value: string,
    size: number,
    opts: {
      x?: number;
      align?: "left" | "right";
      bold?: boolean;
      color?: number;
    } = {},
  ) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setTextColor(opts.color ?? 30);
    doc.text(value, opts.align === "right" ? pageW - margin : opts.x ?? margin, y, {
      align: opts.align ?? "left",
    });
  };

  const merchantName =
    safe(merchant.businessName) || safe(merchant.name) || "Quote";
  text(merchantName, 20, { bold: true });
  y += 7;

  const contact = [
    merchant.contactEmail || merchant.email,
    merchant.contactPhone || merchant.phone,
  ]
    .filter(Boolean)
    .join(" | ");
  if (contact) {
    text(contact, 10, { color: 110 });
    y += 5;
  }
  if (merchant.businessAddress || merchant.address) {
    text(safe(merchant.businessAddress || merchant.address), 10, { color: 110 });
    y += 5;
  }
  if (merchant.gstRegistered && merchant.gstNumber) {
    text(`GST ${merchant.gstNumber}`, 10, { color: 110 });
    y += 5;
  }

  y += 6;
  text("QUOTE", 16, { bold: true });
  text(`Ref ${safe(quote.token).slice(0, 8).toUpperCase()}`, 10, {
    align: "right",
    color: 110,
  });
  y += 6;
  text(`Date: ${fmtDate(quote.createdAt || new Date())}`, 10, { color: 110 });
  if (quote.validUntil) {
    text(`Valid until: ${fmtDate(quote.validUntil)}`, 10, {
      align: "right",
      color: 110,
    });
  }
  y += 8;

  text("Quote for", 9, { bold: true, color: 110 });
  y += 5;
  text(`${safe(client.firstName)} ${safe(client.lastName)}`.trim(), 11);
  y += 5;
  if (client.siteAddress) {
    text(safe(client.siteAddress), 10, { color: 110 });
    y += 6;
  }
  y += 2;

  doc.setDrawColor(220);
  doc.line(margin, y, pageW - margin, y);
  y += 6;
  text("Description", 9, { bold: true, color: 110 });
  text("Amount", 9, { bold: true, color: 110, align: "right" });
  y += 6;

  for (const line of quote.lineItems || []) {
    ensure(12);
    const description = safe(line.description) || "Item";
    text(description.slice(0, 90), 10);
    text(money(line.lineTotalCents ?? 0), 10, { align: "right" });
    y += 5;
    text(`${line.qty} x ${money(line.unitPriceCents ?? 0)}`, 8, { color: 150 });
    y += 6;
  }

  ensure(34);
  doc.line(margin, y, pageW - margin, y);
  y += 7;
  const exclusive = quote.gstMode === "exclusive";
  if (quote.gstCents) {
    text(exclusive ? "Subtotal" : "Subtotal (excl. GST)", 10, { color: 110 });
    text(money(quote.subtotalCents), 10, { align: "right" });
    y += 6;
    text(exclusive ? "GST (15%)" : "GST (15%) included", 10, {
      color: 110,
    });
    text(money(quote.gstCents), 10, { align: "right" });
    y += 6;
  }
  text(exclusive && quote.gstCents ? "Total (incl GST)" : "Total", 12, {
    bold: true,
  });
  text(money(quote.totalCents), 12, { bold: true, align: "right" });
  y += 8;

  if (quote.depositEnabled && quote.depositCents) {
    text("Deposit due on acceptance", 10, { color: 110 });
    text(money(quote.depositCents), 10, { align: "right" });
    y += 7;
  }

  if (quote.notes) {
    ensure(16);
    y += 4;
    text("Notes", 9, { bold: true, color: 110 });
    y += 5;
    const noteLines = doc.splitTextToSize(safe(quote.notes), pageW - margin * 2);
    for (const line of noteLines) {
      ensure(6);
      text(line, 10, { color: 80 });
      y += 5;
    }
  }

  const acceptUrl = `${baseUrl}/trades/quote/${quote.token}`;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Accept online: ${acceptUrl}`, margin, pageH - 14);
  doc.text("Powered by TaptPay", pageW - margin, pageH - 14, {
    align: "right",
  });

  return Buffer.from(doc.output("arraybuffer"));
}

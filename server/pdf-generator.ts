import { jsPDF } from 'jspdf';
import type { Transaction, Merchant } from '../shared/schema';

interface SplitInfo {
  amount: string;
  splitNumber: number;
  totalSplits: number;
}

export async function generateReceiptPdf(
  transaction: Transaction,
  merchant: Merchant,
  splitInfo?: SplitInfo
): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPosition = 30;

  const addText = (text: string, fontSize: number = 12, align: 'left' | 'center' | 'right' = 'left', isBold: boolean = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    if (align === 'center') {
      doc.text(text, pageWidth / 2, yPosition, { align: 'center' });
    } else if (align === 'right') {
      doc.text(text, pageWidth - margin, yPosition, { align: 'right' });
    } else {
      doc.text(text, margin, yPosition);
    }
    yPosition += fontSize * 0.4 + 5;
  };

  const addSpace = (space: number = 10) => {
    yPosition += space;
  };

  const addLine = () => {
    yPosition += 5;
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;
  };

  // Header
  addText('TAPTPAY', 18, 'center', true);
  addText('Digital Payment Receipt', 12, 'center');
  addSpace(20);

  // Business Information
  if (merchant.businessName || merchant.name) {
    addText(merchant.businessName || merchant.name, 16, 'center', true);
  }
  if (merchant.businessAddress) {
    const addressLines = merchant.businessAddress.split('\n');
    addressLines.forEach(line => {
      if (line.trim()) addText(line.trim(), 10, 'center');
    });
  }
  if (merchant.contactEmail) addText(merchant.contactEmail, 10, 'center');
  if (merchant.contactPhone) addText(merchant.contactPhone, 10, 'center');

  addSpace(20);
  addLine();

  // Transaction Details
  addText('TRANSACTION DETAILS', 14, 'left', true);
  addSpace(10);

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-NZ', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const details: [string, string][] = [
    ['Receipt #:', `${transaction.id}`],
    ['Date & Time:', formatDate(transaction.createdAt)],
    ['Item:', transaction.itemName],
    ['Payment Method:', 'Card Payment'],
  ];

  if (splitInfo) {
    details.push(['Split Payment:', `${splitInfo.splitNumber} of ${splitInfo.totalSplits}`]);
  }

  details.forEach(([label, value]) => {
    doc.text(label, margin, yPosition);
    doc.text(value, margin + 70, yPosition);
    yPosition += 15;
  });

  addSpace(10);
  addLine();

  // Price Breakdown
  addText('PAYMENT BREAKDOWN', 14, 'left', true);
  addSpace(10);

  const amount = splitInfo ? parseFloat(splitInfo.amount) : parseFloat(transaction.price);
  const gstRate = 0.15;
  const gstAmount = (amount * gstRate) / (1 + gstRate);
  const netAmount = amount - gstAmount;

  doc.setFontSize(10);

  const breakdown: [string, string][] = [
    ['Subtotal (excl. GST):', `$${netAmount.toFixed(2)}`],
    [`GST (${(gstRate * 100).toFixed(0)}%):`, `$${gstAmount.toFixed(2)}`],
    ['Processing Fee:', '$0.20'],
  ];

  breakdown.forEach(([label, value]) => {
    doc.text(label, margin, yPosition);
    doc.text(value, pageWidth - margin - 30, yPosition);
    yPosition += 15;
  });

  if (splitInfo && splitInfo.totalSplits > 1) {
    const fullTotal = parseFloat(transaction.price);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Original total: $${fullTotal.toFixed(2)} split ${splitInfo.totalSplits} ways`, margin, yPosition);
    yPosition += 12;
  }

  addSpace(5);
  addLine();

  // Total
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const totalLabel = splitInfo ? 'YOUR SHARE:' : 'TOTAL:';
  doc.text(totalLabel, margin, yPosition);
  doc.text(`$${amount.toFixed(2)}`, pageWidth - margin - 30, yPosition);
  yPosition += 20;

  addLine();

  // GST / Tax Info
  addText('TAX INFORMATION', 12, 'left', true);
  addSpace(5);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  if (merchant.gstNumber) {
    doc.text(`GST Number: ${merchant.gstNumber}`, margin, yPosition);
    yPosition += 12;
  }

  doc.text(`This receipt includes GST at the rate of ${(gstRate * 100).toFixed(0)}%`, margin, yPosition);
  yPosition += 20;

  // Footer
  addSpace(20);
  addText('Thank you for your business!', 12, 'center', true);
  addSpace(10);
  addText('Powered by TaptPay', 8, 'center');
  addText('https://taptpay.co.nz', 8, 'center');

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  return pdfBuffer;
}

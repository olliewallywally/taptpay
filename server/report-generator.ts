import { jsPDF } from 'jspdf';
import type { Transaction, Merchant } from '@shared/schema';

export interface ReportData {
  totalTransactions: number;
  completedTransactions: number;
  totalRevenue: number;
  currentProviderCost: number;
  ourCost: number;
  savings: number;
  currentProviderRate: number;
  ourRate: number;
  dateRange: { start: Date | null; end: Date | null };
  averageTransactionValue: number;
  transactionsByStatus: { [key: string]: number };
}

export async function generateBusinessReportPdf(
  analytics: ReportData,
  transactions: Transaction[],
  merchant: Merchant
): Promise<Buffer> {
  const pdf = new jsPDF();
  
  // Set up fonts and colors
  pdf.setFont('helvetica');
  
  // Header background
  pdf.setFillColor(22, 101, 52); // Forest green
  pdf.rect(0, 0, 210, 25, 'F');
  
  // Header text
  pdf.setFontSize(24);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Business Analytics Report', 20, 16);
  
  // Subheader background
  pdf.setFillColor(240, 253, 244); // Light green
  pdf.rect(0, 25, 210, 15, 'F');
  
  // Business info in subheader
  pdf.setFontSize(14);
  pdf.setTextColor(22, 101, 52);
  pdf.text(`${merchant.businessName || merchant.name}`, 20, 35);
  
  // Date range
  const dateRangeText = analytics.dateRange.start || analytics.dateRange.end
    ? `${analytics.dateRange.start?.toLocaleDateString('en-NZ') || 'Beginning'} - ${analytics.dateRange.end?.toLocaleDateString('en-NZ') || 'Today'}`
    : 'All Time Data';
  pdf.setFontSize(10);
  pdf.setTextColor(107, 114, 128);
  pdf.text(`Report Period: ${dateRangeText}`, 20, 47);
  pdf.text(`Generated: ${new Date().toLocaleDateString('en-NZ', { 
    year: 'numeric', month: 'long', day: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  })}`, 20, 54);
  
  // Key Metrics Cards
  let yPos = 70;
  
  // Create metric cards
  const cards = [
    { 
      title: 'Total Revenue', 
      value: `$${analytics.totalRevenue.toFixed(2)}`, 
      subtitle: 'NZD', 
      color: [34, 197, 94],
      x: 20 
    },
    { 
      title: 'Transactions', 
      value: analytics.totalTransactions.toString(), 
      subtitle: `${analytics.completedTransactions} completed`, 
      color: [59, 130, 246],
      x: 70 
    },
    { 
      title: 'Average Sale', 
      value: `$${analytics.averageTransactionValue.toFixed(2)}`, 
      subtitle: 'per transaction', 
      color: [168, 85, 247],
      x: 120 
    },
    { 
      title: 'Savings', 
      value: `$${analytics.savings.toFixed(2)}`, 
      subtitle: 'vs current provider', 
      color: [249, 115, 22],
      x: 170 
    }
  ];

  cards.forEach(card => {
    // Card background
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(card.x, yPos, 35, 25, 2, 2, 'F');
    
    // Card border
    pdf.setDrawColor(card.color[0], card.color[1], card.color[2]);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(card.x, yPos, 35, 25, 2, 2, 'S');
    
    // Title
    pdf.setFontSize(8);
    pdf.setTextColor(107, 114, 128);
    pdf.text(card.title, card.x + 2, yPos + 6);
    
    // Value
    pdf.setFontSize(14);
    pdf.setTextColor(card.color[0], card.color[1], card.color[2]);
    pdf.text(card.value, card.x + 2, yPos + 14);
    
    // Subtitle
    pdf.setFontSize(7);
    pdf.setTextColor(156, 163, 175);
    pdf.text(card.subtitle, card.x + 2, yPos + 20);
  });

  // Cost Comparison Chart
  pdf.setFontSize(16);
  pdf.setTextColor(22, 101, 52);
  pdf.text('Cost Comparison Analysis', 20, yPos);
  yPos += 15;

  // Chart background
  const chartX = 20;
  const chartY = yPos;
  const chartWidth = 170;
  const chartHeight = 30;
  
  pdf.setFillColor(255, 255, 255);
  pdf.rect(chartX, chartY, chartWidth, chartHeight, 'F');
  pdf.setDrawColor(229, 231, 235);
  pdf.rect(chartX, chartY, chartWidth, chartHeight, 'S');

  // Current provider bar (red)
  const currentProviderWidth = (analytics.currentProviderCost / Math.max(analytics.currentProviderCost, analytics.ourCost)) * (chartWidth - 40);
  pdf.setFillColor(239, 68, 68);
  pdf.rect(chartX + 5, chartY + 5, currentProviderWidth, 8, 'F');
  
  // Tapt bar (green)
  const taptWidth = (analytics.ourCost / Math.max(analytics.currentProviderCost, analytics.ourCost)) * (chartWidth - 40);
  pdf.setFillColor(34, 197, 94);
  pdf.rect(chartX + 5, chartY + 18, taptWidth, 8, 'F');

  // Labels
  pdf.setFontSize(9);
  pdf.setTextColor(239, 68, 68);
  pdf.text(`Current Provider: $${analytics.currentProviderCost.toFixed(2)}`, chartX + currentProviderWidth + 10, chartY + 11);
  pdf.setTextColor(34, 197, 94);
  pdf.text(`Tapt: $${analytics.ourCost.toFixed(2)}`, chartX + taptWidth + 10, chartY + 24);

  yPos += chartHeight + 20;

  // Transaction Status Pie Chart
  pdf.setFontSize(16);
  pdf.setTextColor(22, 101, 52);
  pdf.text('Transaction Status Distribution', 20, yPos);
  yPos += 15;

  // Pie chart
  const pieX = 50;
  const pieY = yPos + 15;
  const pieRadius = 20;
  
  const statusEntries = Object.entries(analytics.transactionsByStatus);
  const total = Object.values(analytics.transactionsByStatus).reduce((sum, count) => sum + count, 0);
  
  let currentAngle = 0;
  const colors = [
    [34, 197, 94],   // completed - green
    [239, 68, 68],   // failed - red
    [59, 130, 246],  // processing - blue
    [168, 85, 247]   // pending - purple
  ];

  statusEntries.forEach(([status, count], index) => {
    const percentage = count / total;
    const sliceAngle = percentage * 360;
    
    // Draw pie slice
    const color = colors[index % colors.length];
    pdf.setFillColor(color[0], color[1], color[2]);
    
    // Simple pie slice approximation using triangles
    const steps = Math.max(1, Math.floor(sliceAngle / 10));
    for (let i = 0; i < steps; i++) {
      const angle1 = (currentAngle + (sliceAngle * i / steps)) * Math.PI / 180;
      const angle2 = (currentAngle + (sliceAngle * (i + 1) / steps)) * Math.PI / 180;
      
      const x1 = pieX + pieRadius * Math.cos(angle1);
      const y1 = pieY + pieRadius * Math.sin(angle1);
      const x2 = pieX + pieRadius * Math.cos(angle2);
      const y2 = pieY + pieRadius * Math.sin(angle2);
      
      pdf.triangle(pieX, pieY, x1, y1, x2, y2, 'F');
    }
    
    currentAngle += sliceAngle;
  });

  // Legend
  let legendY = yPos + 5;
  statusEntries.forEach(([status, count], index) => {
    const percentage = ((count / total) * 100).toFixed(1);
    const color = colors[index % colors.length];
    
    // Color box
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.rect(100, legendY, 4, 4, 'F');
    
    // Text
    pdf.setFontSize(9);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`${status.charAt(0).toUpperCase() + status.slice(1)}: ${count} (${percentage}%)`, 107, legendY + 3);
    legendY += 8;
  });

  // Recent transactions table
  if (transactions.length > 0) {
    yPos += 10;
    pdf.setFontSize(16);
    pdf.setTextColor(22, 101, 52);
    pdf.text('Recent Transaction Details', 20, yPos);
    yPos += 15;
    
    // Table header background
    pdf.setFillColor(248, 250, 252);
    pdf.rect(20, yPos, 170, 10, 'F');
    
    // Table headers
    pdf.setFontSize(9);
    pdf.setTextColor(75, 85, 99);
    pdf.text('Date', 22, yPos + 7);
    pdf.text('Item', 55, yPos + 7);
    pdf.text('Amount', 120, yPos + 7);
    pdf.text('Status', 155, yPos + 7);
    yPos += 10;
    
    // Show last 10 transactions
    const recentTransactions = transactions
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 10);
    
    recentTransactions.forEach((transaction, index) => {
      if (yPos > 260) { // Page break
        pdf.addPage();
        
        // Header on new page
        pdf.setFillColor(22, 101, 52);
        pdf.rect(0, 0, 210, 25, 'F');
        pdf.setFontSize(24);
        pdf.setTextColor(255, 255, 255);
        pdf.text('Business Analytics Report (Continued)', 20, 16);
        
        yPos = 40;
      }
      
      // Alternating row colors
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(20, yPos - 2, 170, 8, 'F');
      }
      
      const date = transaction.createdAt 
        ? new Date(transaction.createdAt).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' })
        : 'N/A';
      
      pdf.setFontSize(8);
      pdf.setTextColor(0, 0, 0);
      pdf.text(date, 22, yPos + 3);
      pdf.text(transaction.itemName.substring(0, 25), 55, yPos + 3);
      pdf.text(`$${parseFloat(transaction.price).toFixed(2)}`, 120, yPos + 3);
      
      // Status with color
      const statusColors: { [key: string]: [number, number, number] } = {
        completed: [34, 197, 94],
        failed: [239, 68, 68],
        processing: [59, 130, 246],
        pending: [168, 85, 247]
      };
      const statusColor = statusColors[transaction.status] || [107, 114, 128];
      pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      pdf.text(transaction.status.toUpperCase(), 155, yPos + 3);
      
      yPos += 8;
    });
  }

  // Summary insights box
  yPos += 15;
  if (yPos > 240) {
    pdf.addPage();
    yPos = 30;
  }

  pdf.setFillColor(240, 253, 244);
  pdf.rect(20, yPos, 170, 25, 'F');
  pdf.setDrawColor(34, 197, 94);
  pdf.rect(20, yPos, 170, 25, 'S');
  
  pdf.setFontSize(12);
  pdf.setTextColor(22, 101, 52);
  pdf.text('💡 Key Insights', 25, yPos + 8);
  
  pdf.setFontSize(9);
  pdf.setTextColor(75, 85, 99);
  const successRate = ((analytics.completedTransactions / analytics.totalTransactions) * 100).toFixed(1);
  pdf.text(`• Transaction success rate: ${successRate}%`, 25, yPos + 15);
  pdf.text(`• Monthly savings with Tapt: $${(analytics.savings * 12).toFixed(2)}`, 25, yPos + 20);
  
  yPos += 35;
  
  // Footer
  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 285, 210, 12, 'F');
  pdf.setFontSize(8);
  pdf.setTextColor(107, 114, 128);
  pdf.text('Generated by Tapt Payment Terminal • Advanced Payment Processing Solutions', 20, 291);
  pdf.text(`Report ID: RPT-${Date.now().toString().slice(-6)} • tapt.co.nz`, 140, 291);
  
  return Buffer.from(pdf.output('arraybuffer'));
}
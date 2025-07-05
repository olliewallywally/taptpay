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
  pdf.rect(0, 0, 210, 30, 'F');
  
  // Logo placeholder (top right)
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(165, 5, 35, 20, 2, 2, 'F');
  pdf.setFontSize(8);
  pdf.setTextColor(22, 101, 52);
  pdf.text('TAPT', 175, 12);
  pdf.text('Payment Terminal', 167, 18);
  
  // Header text
  pdf.setFontSize(24);
  pdf.setTextColor(255, 255, 255);
  pdf.text('Business Analytics Report', 20, 20);
  
  // Business info 
  pdf.setFontSize(12);
  pdf.setTextColor(255, 255, 255);
  pdf.text(`${merchant.businessName || merchant.name}`, 20, 27);
  
  // Date range section
  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 30, 210, 12, 'F');
  
  const dateRangeText = analytics.dateRange.start || analytics.dateRange.end
    ? `${analytics.dateRange.start?.toLocaleDateString('en-NZ') || 'Beginning'} - ${analytics.dateRange.end?.toLocaleDateString('en-NZ') || 'Today'}`
    : 'All Time Data';
  pdf.setFontSize(10);
  pdf.setTextColor(107, 114, 128);
  pdf.text(`Report Period: ${dateRangeText}`, 20, 37);
  pdf.text(`Generated: ${new Date().toLocaleDateString('en-NZ', { 
    year: 'numeric', month: 'long', day: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  })}`, 120, 37);
  
  // Key Metrics Cards
  let yPos = 50;
  
  // Create metric cards with proper spacing
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
      x: 67 
    },
    { 
      title: 'Average Sale', 
      value: `$${analytics.averageTransactionValue.toFixed(2)}`, 
      subtitle: 'per transaction', 
      color: [168, 85, 247],
      x: 114 
    },
    { 
      title: 'Savings', 
      value: `$${analytics.savings.toFixed(2)}`, 
      subtitle: 'vs current provider', 
      color: [249, 115, 22],
      x: 161 
    }
  ];

  cards.forEach(card => {
    // Card background
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(card.x, yPos, 42, 28, 2, 2, 'F');
    
    // Card border
    pdf.setDrawColor(card.color[0], card.color[1], card.color[2]);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(card.x, yPos, 42, 28, 2, 2, 'S');
    
    // Title
    pdf.setFontSize(8);
    pdf.setTextColor(107, 114, 128);
    pdf.text(card.title, card.x + 3, yPos + 8);
    
    // Value
    pdf.setFontSize(12);
    pdf.setTextColor(card.color[0], card.color[1], card.color[2]);
    pdf.text(card.value, card.x + 3, yPos + 17);
    
    // Subtitle
    pdf.setFontSize(7);
    pdf.setTextColor(156, 163, 175);
    pdf.text(card.subtitle, card.x + 3, yPos + 24);
  });

  yPos += 35;

  // Transaction Volume Bar Chart
  pdf.setFontSize(14);
  pdf.setTextColor(22, 101, 52);
  pdf.text('Transaction Analysis', 20, yPos);
  yPos += 12;

  // Create transaction status bar chart
  const chartX = 20;
  const chartY = yPos;
  const chartWidth = 170;
  const chartHeight = 35;
  
  // Chart background
  pdf.setFillColor(249, 250, 251);
  pdf.rect(chartX, chartY, chartWidth, chartHeight, 'F');
  pdf.setDrawColor(229, 231, 235);
  pdf.rect(chartX, chartY, chartWidth, chartHeight, 'S');

  // Chart data
  const statusData = [
    { label: 'Completed', count: analytics.transactionsByStatus.completed || 0, color: [34, 197, 94] },
    { label: 'Failed', count: analytics.transactionsByStatus.failed || 0, color: [239, 68, 68] },
    { label: 'Processing', count: analytics.transactionsByStatus.processing || 0, color: [59, 130, 246] },
    { label: 'Pending', count: analytics.transactionsByStatus.pending || 0, color: [168, 85, 247] }
  ].filter(item => item.count > 0);

  const maxCount = Math.max(...statusData.map(item => item.count));
  const barWidth = 20;
  const barSpacing = 30;
  
  statusData.forEach((item, index) => {
    const barHeight = maxCount > 0 ? (item.count / maxCount) * 20 : 0;
    const barX = chartX + 20 + (index * barSpacing);
    const barY = chartY + chartHeight - 15 - barHeight;
    
    // Draw bar
    pdf.setFillColor(item.color[0], item.color[1], item.color[2]);
    pdf.rect(barX, barY, barWidth, barHeight, 'F');
    
    // Value on top of bar
    pdf.setFontSize(8);
    pdf.setTextColor(0, 0, 0);
    pdf.text(item.count.toString(), barX + 8, barY - 2);
    
    // Label below bar
    pdf.setFontSize(7);
    pdf.setTextColor(107, 114, 128);
    pdf.text(item.label, barX + 2, chartY + chartHeight - 5);
  });

  // Cost Comparison Section
  pdf.setFontSize(14);
  pdf.setTextColor(22, 101, 52);
  pdf.text('Cost Savings with Tapt', 20, yPos);
  yPos += 12;

  // Simple cost comparison chart
  const costChartY = yPos;
  const costChartHeight = 25;
  
  // Background
  pdf.setFillColor(249, 250, 251);
  pdf.rect(20, costChartY, 170, costChartHeight, 'F');
  pdf.setDrawColor(229, 231, 235);
  pdf.rect(20, costChartY, 170, costChartHeight, 'S');

  // Cost comparison bars
  const maxCost = Math.max(analytics.currentProviderCost, analytics.ourCost);
  const barMaxWidth = 100;
  
  // Current provider bar
  const providerBarWidth = maxCost > 0 ? (analytics.currentProviderCost / maxCost) * barMaxWidth : 0;
  pdf.setFillColor(239, 68, 68);
  pdf.rect(25, costChartY + 5, providerBarWidth, 5, 'F');
  
  // Tapt bar
  const taptBarWidth = maxCost > 0 ? (analytics.ourCost / maxCost) * barMaxWidth : 0;
  pdf.setFillColor(34, 197, 94);
  pdf.rect(25, costChartY + 14, taptBarWidth, 5, 'F');

  // Labels
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Current Provider: $${analytics.currentProviderCost.toFixed(2)}`, 135, costChartY + 9);
  pdf.text(`Tapt Processing: $${analytics.ourCost.toFixed(2)}`, 135, costChartY + 18);

  yPos += costChartHeight + 15;

  // Recent transactions table
  if (transactions.length > 0) {
    pdf.setFontSize(14);
    pdf.setTextColor(22, 101, 52);
    pdf.text('Recent Transaction Details', 20, yPos);
    yPos += 12;
    
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
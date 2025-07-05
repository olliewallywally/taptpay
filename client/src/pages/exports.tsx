import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, FileSpreadsheet, Calendar, TrendingUp } from "lucide-react";
import { format } from "date-fns";

type DateRange = "7days" | "30days" | "90days" | "1year" | "lifetime" | "custom";

export default function Exports() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange>("30days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Get current user's merchant ID (for demo, using merchant ID 1)
  const merchantId = 1;

  // Calculate date range based on selection
  const getDateRange = () => {
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    switch (dateRange) {
      case "7days":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case "30days":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case "90days":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case "1year":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case "custom":
        startDate = customStartDate ? new Date(customStartDate) : undefined;
        endDate = customEndDate ? new Date(customEndDate) : undefined;
        break;
      case "lifetime":
      default:
        startDate = undefined;
        endDate = undefined;
    }

    return { startDate, endDate };
  };

  // Fetch analytics for the selected date range
  const { data: analytics, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: ['/api/merchants', merchantId, 'analytics/export', dateRange, customStartDate, customEndDate],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) params.append('endDate', endDate.toISOString());
      
      const response = await fetch(`/api/merchants/${merchantId}/analytics/export?${params}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
  });

  // CSV Export mutation
  const csvExportMutation = useMutation({
    mutationFn: async () => {
      const { startDate, endDate } = getDateRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) params.append('endDate', endDate.toISOString());
      
      const response = await fetch(`/api/merchants/${merchantId}/export/csv?${params}`);
      if (!response.ok) throw new Error('Failed to export CSV');
      
      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'transactions.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Export Complete",
        description: "Your transaction data has been downloaded as CSV.",
      });
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "There was an error downloading your CSV file.",
        variant: "destructive",
      });
    },
  });

  // PDF Export mutation
  const pdfExportMutation = useMutation({
    mutationFn: async () => {
      const { startDate, endDate } = getDateRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) params.append('endDate', endDate.toISOString());
      
      const response = await fetch(`/api/merchants/${merchantId}/export/pdf?${params}`);
      if (!response.ok) throw new Error('Failed to export PDF');
      
      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'business_report.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Report Generated",
        description: "Your business report has been downloaded as PDF.",
      });
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "There was an error generating your PDF report.",
        variant: "destructive",
      });
    },
  });

  const formatDateRange = () => {
    const { startDate, endDate } = getDateRange();
    if (!startDate && !endDate) return "All Time";
    if (startDate && endDate) {
      return `${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`;
    }
    if (startDate) return `From ${format(startDate, 'dd/MM/yyyy')}`;
    if (endDate) return `Until ${format(endDate, 'dd/MM/yyyy')}`;
    return "Custom Range";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Export Data</h1>
        <p className="text-gray-600">Download your transaction data and business reports</p>
      </div>

      {/* Date Range Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="w-5 h-5" />
            <span>Select Time Period</span>
          </CardTitle>
          <CardDescription>
            Choose the date range for your export
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dateRange">Time Period</Label>
              <Select value={dateRange} onValueChange={(value: DateRange) => setDateRange(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="90days">Last 90 Days</SelectItem>
                  <SelectItem value="1year">Last Year</SelectItem>
                  <SelectItem value="lifetime">All Time</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRange === "custom" && (
              <>
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              <strong>Selected Period:</strong> {formatDateRange()}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Preview */}
      {analytics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5" />
              <span>Data Summary</span>
            </CardTitle>
            <CardDescription>
              Overview of your selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{analytics.totalTransactions}</p>
                <p className="text-sm text-gray-600">Total Transactions</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{analytics.completedTransactions}</p>
                <p className="text-sm text-gray-600">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">${analytics.totalRevenue.toFixed(2)}</p>
                <p className="text-sm text-gray-600">Revenue</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">${analytics.savings.toFixed(2)}</p>
                <p className="text-sm text-gray-600">Savings with Tapt</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CSV Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileSpreadsheet className="w-5 h-5" />
              <span>CSV Export</span>
            </CardTitle>
            <CardDescription>
              Download transaction data for Excel or spreadsheet analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600">
              <p><strong>Includes:</strong></p>
              <ul className="list-disc list-inside mt-2">
                <li>Transaction ID and timestamps</li>
                <li>Item names and amounts</li>
                <li>Payment status and references</li>
                <li>Ready for Excel import</li>
              </ul>
            </div>
            
            <Button 
              onClick={() => csvExportMutation.mutate()}
              disabled={csvExportMutation.isPending || isLoadingAnalytics}
              className="w-full"
            >
              {csvExportMutation.isPending ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Exporting...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Download className="w-4 h-4" />
                  <span>Download CSV</span>
                </div>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* PDF Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="w-5 h-5" />
              <span>Business Report</span>
            </CardTitle>
            <CardDescription>
              Generate a comprehensive PDF business report
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600">
              <p><strong>Includes:</strong></p>
              <ul className="list-disc list-inside mt-2">
                <li>Executive summary with key metrics</li>
                <li>Cost comparison and savings</li>
                <li>Transaction breakdown by status</li>
                <li>Recent transaction details</li>
              </ul>
            </div>
            
            <Button 
              onClick={() => pdfExportMutation.mutate()}
              disabled={pdfExportMutation.isPending || isLoadingAnalytics}
              className="w-full"
            >
              {pdfExportMutation.isPending ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Download className="w-4 h-4" />
                  <span>Download Report</span>
                </div>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
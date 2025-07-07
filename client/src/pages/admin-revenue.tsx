import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Users, CreditCard } from "lucide-react";

interface PlatformFees {
  totalFees: number;
  totalTransactions: number;
}

export default function AdminRevenue() {
  const { data: platformFees, isLoading } = useQuery<PlatformFees>({
    queryKey: ["/api/admin/platform-fees"],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading revenue data...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Platform Revenue Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Track platform earnings from transaction fees
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${platformFees?.totalFees?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">
              From platform fees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {platformFees?.totalTransactions || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Completed payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fee per Transaction</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.05</div>
            <p className="text-xs text-muted-foreground">
              Fixed platform fee
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Monthly</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${((platformFees?.totalFees || 0) / Math.max(1, Math.ceil((platformFees?.totalTransactions || 1) / 30))).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated monthly revenue
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <span className="font-medium">Windcave Fee</span>
                <Badge variant="secondary">$0.20 per transaction</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <span className="font-medium">Platform Fee</span>
                <Badge variant="default">$0.05 per transaction</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <span className="font-medium">Merchant Receives</span>
                <Badge variant="outline">Transaction Amount - $0.25</Badge>
              </div>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Merchants pay a total of $0.25 per transaction: $0.20 to Windcave for processing and $0.05 to our platform.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fee Collection Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Collection Status</span>
                <Badge variant="default" className="bg-green-600">
                  Automatic
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Payment Processor</span>
                <Badge variant="secondary">Windcave</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Fee Deduction</span>
                <Badge variant="outline">Real-time</Badge>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                Platform fees are automatically deducted from each transaction and tracked in real-time. 
                Merchants see their net amount after all fees are applied.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {platformFees?.totalTransactions === 0 && (
        <Card className="mt-6">
          <CardContent className="text-center py-8">
            <div className="text-gray-500 dark:text-gray-400">
              No transactions processed yet. Revenue tracking will appear here once merchants start processing payments.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
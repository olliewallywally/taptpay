import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, DollarSign, TrendingUp, Users } from "lucide-react";
import { PLAN_LIST, formatPlanPrice, planForOrDefault } from "@shared/plans";

interface SubscriptionRevenue {
  monthlyRecurringRevenue: number;
  payingSubscriptions: number;
  totalSubscriptions: number;
  byPlan: Record<string, { count: number; monthlyRevenue: number }>;
  pastDue: number;
  suspended: number;
  cancelling: number;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value);

export default function AdminRevenue() {
  const { data: revenue, isLoading } = useQuery<SubscriptionRevenue>({
    queryKey: ["/api/admin/subscription-revenue"],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading revenue data...</div>
      </div>
    );
  }

  const mrr = revenue?.monthlyRecurringRevenue ?? 0;
  const paying = revenue?.payingSubscriptions ?? 0;
  const atRisk = (revenue?.pastDue ?? 0) + (revenue?.suspended ?? 0) + (revenue?.cancelling ?? 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Platform Revenue Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Recurring subscription revenue. TaptPay takes no cut of merchant turnover.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(mrr)}</div>
            <p className="text-xs text-muted-foreground">Committed for next period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paying Subscriptions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paying}</div>
            <p className="text-xs text-muted-foreground">
              of {revenue?.totalSubscriptions ?? 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annual Run Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(mrr * 12)}</div>
            <p className="text-xs text-muted-foreground">MRR × 12</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{atRisk}</div>
            <p className="text-xs text-muted-foreground">
              Past due, suspended or cancelling
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {PLAN_LIST.map((plan) => {
              const bucket = revenue?.byPlan?.[plan.id];
              return (
                <div
                  key={plan.id}
                  className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div>
                    <span className="font-medium">{plan.name}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      {formatPlanPrice(plan.priceCents)}/mo · {plan.seats}{" "}
                      {plan.seats === 1 ? "login" : "logins"}
                    </span>
                  </div>
                  <Badge variant={bucket?.count ? "default" : "outline"}>
                    {bucket?.count ?? 0} · {money(bucket?.monthlyRevenue ?? 0)}
                  </Badge>
                </div>
              );
            })}
            <div className="text-sm text-gray-600 dark:text-gray-400 pt-2">
              MRR counts active subscriptions that are not cancelling. Past-due rows are
              excluded — that is money not yet collected.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Past due</span>
                <Badge variant={revenue?.pastDue ? "destructive" : "outline"}>
                  {revenue?.pastDue ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Suspended</span>
                <Badge variant={revenue?.suspended ? "destructive" : "outline"}>
                  {revenue?.suspended ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Cancelling at period end</span>
                <Badge variant={revenue?.cancelling ? "secondary" : "outline"}>
                  {revenue?.cancelling ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Payment processor</span>
                <Badge variant="secondary">Windcave</Badge>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                Subscriptions are charged monthly to a Windcave card-on-file. A declined
                charge moves the merchant to past due, retries, then suspends.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {revenue?.totalSubscriptions === 0 && (
        <Card className="mt-6">
          <CardContent className="text-center py-8">
            <div className="text-gray-500 dark:text-gray-400">
              No subscriptions yet. Revenue will appear here once merchants sign up on the{" "}
              {planForOrDefault(undefined).name} plan or above.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Settings as SettingsIcon, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink,
  Key,
  Shield,
  Globe
} from "lucide-react";

export default function Settings() {
  // Get Windcave API status
  const { data: apiStatus, isLoading } = useQuery({
    queryKey: ["/api/windcave/status"],
    queryFn: async () => {
      const response = await fetch("/api/windcave/status");
      if (!response.ok) throw new Error("Failed to fetch API status");
      return response.json();
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings & Configuration</h1>
        <p className="text-gray-600">Manage your payment processing configuration and API connections</p>
      </div>

      {/* API Status Card */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Payment Gateway Status</span>
          </CardTitle>
          <CardDescription>
            Current status of your Windcave payment gateway integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-32 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-64"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {apiStatus?.configured ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-yellow-600" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">
                      {apiStatus?.configured ? "API Configured" : "API Not Configured"}
                    </p>
                    <p className="text-sm text-gray-500">{apiStatus?.message}</p>
                  </div>
                </div>
                <Badge variant={apiStatus?.configured ? "default" : "secondary"}>
                  {apiStatus?.mode || "Unknown"}
                </Badge>
              </div>
              
              {!apiStatus?.configured && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Setup Required</AlertTitle>
                  <AlertDescription>
                    Currently running in simulation mode. Configure your Windcave API credentials to process real payments.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Key className="h-5 w-5" />
            <span>Windcave API Setup</span>
          </CardTitle>
          <CardDescription>
            Follow these steps to connect your Windcave payment gateway
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">1. Get Windcave Account</h3>
              <p className="text-gray-600">
                Contact Windcave to set up your merchant account and get API credentials.
              </p>
              <div className="flex items-center space-x-2">
                <Globe className="h-4 w-4 text-gray-400" />
                <a 
                  href="https://www.windcave.com/contact" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline flex items-center space-x-1"
                >
                  <span>Contact Windcave Sales</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">2. Configure Environment Variables</h3>
              <p className="text-gray-600">
                Add your Windcave credentials to your environment variables:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                <div className="space-y-1">
                  <div>WINDCAVE_USERNAME=your_api_username</div>
                  <div>WINDCAVE_API_KEY=your_api_key</div>
                  <div>WINDCAVE_ENDPOINT=https://uat.windcave.com/api/v1  # Use sandbox for testing</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">3. Integration Options</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Hosted Payment Page (Recommended)</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Customers are redirected to Windcave's secure payment page. Lowest PCI compliance requirements.
                  </p>
                  <Badge variant="outline" className="text-green-600 border-green-600">PCI SAQ Level A</Badge>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">REST API Integration</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Full control over the payment flow with server-to-server API calls.
                  </p>
                  <Badge variant="outline" className="text-orange-600 border-orange-600">PCI SAQ Level D</Badge>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">4. Testing</h3>
              <p className="text-gray-600">
                Use Windcave's UAT (User Acceptance Testing) environment for development and testing:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-4">
                <li>Test card numbers available in Windcave documentation</li>
                <li>Sandbox environment for safe testing</li>
                <li>Real-time transaction monitoring</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">5. Go Live</h3>
              <p className="text-gray-600">
                When ready for production:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-4">
                <li>Update WINDCAVE_ENDPOINT to production URL</li>
                <li>Use production API credentials</li>
                <li>Complete Windcave's go-live process</li>
                <li>Implement proper error handling and monitoring</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <SettingsIcon className="h-5 w-5" />
            <span>Current Configuration</span>
          </CardTitle>
          <CardDescription>
            Review your current payment processing setup
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Payment Provider</label>
                <p className="text-gray-900">Windcave (formerly Payment Express)</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Processing Rate</label>
                <p className="text-gray-900 font-semibold text-green-600">0.20% per transaction</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Currency</label>
                <p className="text-gray-900">NZD (New Zealand Dollar)</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Integration Method</label>
                <p className="text-gray-900">REST API with Hosted Payment Page</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
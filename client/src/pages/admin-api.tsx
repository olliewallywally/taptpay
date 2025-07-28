import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Key, 
  Plus, 
  Eye, 
  EyeOff, 
  Copy, 
  Settings, 
  Activity, 
  Globe, 
  Webhook, 
  Shield,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  Code,
  Book,
  Zap
} from "lucide-react";
import { format } from "date-fns";

interface ApiKey {
  id: number;
  keyName: string;
  keyPrefix: string;
  environment: 'sandbox' | 'live';
  status: 'active' | 'inactive' | 'revoked';
  permissions: string[];
  webhookUrl?: string;
  rateLimitPerHour: number;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

interface ApiMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsToday: number;
  webhookDeliveryRate: number;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'create_transactions', label: 'Create Transactions', description: 'Create new payment transactions' },
  { id: 'read_transactions', label: 'Read Transactions', description: 'View transaction details and status' },
  { id: 'update_transactions', label: 'Update Transactions', description: 'Modify transaction data' },
  { id: 'create_refunds', label: 'Create Refunds', description: 'Process refunds for transactions' },
  { id: 'read_refunds', label: 'Read Refunds', description: 'View refund details' },
  { id: 'webhook_events', label: 'Webhook Events', description: 'Receive webhook notifications' },
];

export default function AdminApi() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState<{[key: number]: boolean}>({});
  const [newKeyData, setNewKeyData] = useState({
    keyName: '',
    environment: 'sandbox' as 'sandbox' | 'live',
    permissions: [] as string[],
    webhookUrl: '',
    rateLimitPerHour: 1000,
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch API keys
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ['/api/admin/api-keys'],
  });

  // Fetch API metrics
  const { data: metrics } = useQuery<ApiMetrics>({
    queryKey: ['/api/admin/api-metrics'],
  });

  // Fetch API usage analytics
  const { data: usageData = [] } = useQuery({
    queryKey: ['/api/admin/api-usage'],
  });

  // Create API key mutation
  const createKeyMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/admin/api-keys`, {
      method: 'POST',
      body: data,
    }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-keys'] });
      setIsCreateDialogOpen(false);
      setNewKeyData({
        keyName: '',
        environment: 'sandbox',
        permissions: [],
        webhookUrl: '',
        rateLimitPerHour: 1000,
      });
      toast({
        title: "API Key Created",
        description: `New ${response.environment} API key "${response.keyName}" has been created successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create API key",
        variant: "destructive"
      });
    }
  });

  // Revoke API key mutation
  const revokeKeyMutation = useMutation({
    mutationFn: (keyId: number) => apiRequest(`/api/admin/api-keys/${keyId}/revoke`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-keys'] });
      toast({
        title: "API Key Revoked",
        description: "The API key has been revoked successfully",
      });
    }
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "API key copied to clipboard",
    });
  };

  const toggleApiKeyVisibility = (keyId: number) => {
    setShowApiKey(prev => ({...prev, [keyId]: !prev[keyId]}));
  };

  const handlePermissionChange = (permission: string, checked: boolean) => {
    setNewKeyData(prev => ({
      ...prev,
      permissions: checked 
        ? [...prev.permissions, permission]
        : prev.permissions.filter(p => p !== permission)
    }));
  };

  const handleCreateKey = () => {
    if (!newKeyData.keyName || newKeyData.permissions.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please provide a key name and select at least one permission",
        variant: "destructive"
      });
      return;
    }
    createKeyMutation.mutate(newKeyData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-pink-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
                <Code className="h-8 w-8 text-blue-400" />
                Tapt API Management
              </h1>
              <p className="text-white/60 mt-2">Manage API keys and integrations for ecommerce platforms</p>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={() => window.open('https://docs.tapt.co.nz/api', '_blank')}
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <Book className="h-4 w-4 mr-2" />
                API Docs
              </Button>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-500/80 border-blue-400/50 text-white hover:bg-blue-500">
                    <Plus className="h-4 w-4 mr-2" />
                    Create API Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] bg-black/90 backdrop-blur-xl border border-white/20 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-semibold text-white flex items-center gap-2">
                      <Key className="h-5 w-5 text-blue-400" />
                      Create New API Key
                    </DialogTitle>
                    <DialogDescription className="text-white/70">
                      Generate a new API key for ecommerce platform integration
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label className="text-white/80">Key Name</Label>
                      <Input
                        value={newKeyData.keyName}
                        onChange={(e) => setNewKeyData(prev => ({...prev, keyName: e.target.value}))}
                        placeholder="e.g., Shopify Store API Key"
                        className="bg-white/10 border-white/20 text-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white/80">Environment</Label>
                      <Select value={newKeyData.environment} onValueChange={(value: 'sandbox' | 'live') => setNewKeyData(prev => ({...prev, environment: value}))}>
                        <SelectTrigger className="bg-white/10 border-white/20 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-black/90 backdrop-blur-xl border border-white/20">
                          <SelectItem value="sandbox" className="text-white">Sandbox (Testing)</SelectItem>
                          <SelectItem value="live" className="text-white">Live (Production)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white/80">Permissions</Label>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {AVAILABLE_PERMISSIONS.map((permission) => (
                          <div key={permission.id} className="flex items-start space-x-2">
                            <Checkbox
                              id={permission.id}
                              checked={newKeyData.permissions.includes(permission.id)}
                              onCheckedChange={(checked) => handlePermissionChange(permission.id, checked as boolean)}
                              className="mt-1"
                            />
                            <div className="grid gap-1.5 leading-none">
                              <label
                                htmlFor={permission.id}
                                className="text-sm font-medium text-white leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {permission.label}
                              </label>
                              <p className="text-xs text-white/60">
                                {permission.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white/80">Webhook URL (Optional)</Label>
                      <Input
                        value={newKeyData.webhookUrl}
                        onChange={(e) => setNewKeyData(prev => ({...prev, webhookUrl: e.target.value}))}
                        placeholder="https://your-store.com/webhooks/tapt"
                        className="bg-white/10 border-white/20 text-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white/80">Rate Limit (Requests/Hour)</Label>
                      <Input
                        type="number"
                        value={newKeyData.rateLimitPerHour}
                        onChange={(e) => setNewKeyData(prev => ({...prev, rateLimitPerHour: parseInt(e.target.value) || 1000}))}
                        min="100"
                        max="10000"
                        className="bg-white/10 border-white/20 text-white"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={() => setIsCreateDialogOpen(false)}
                      variant="outline"
                      className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateKey}
                      disabled={createKeyMutation.isPending}
                      className="flex-1 bg-blue-500/80 border-blue-400/50 text-white hover:bg-blue-500"
                    >
                      {createKeyMutation.isPending ? "Creating..." : "Create API Key"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white/10 border border-white/20 p-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-white/20 data-[state=active]:text-white">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="keys" className="data-[state=active]:bg-white/20 data-[state=active]:text-white">
              <Key className="h-4 w-4 mr-2" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="data-[state=active]:bg-white/20 data-[state=active]:text-white">
              <Webhook className="h-4 w-4 mr-2" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="docs" className="data-[state=active]:bg-white/20 data-[state=active]:text-white">
              <Book className="h-4 w-4 mr-2" />  
              Documentation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* API Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-white/5 border-white/20 backdrop-blur-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-green-400" />
                    Total API Calls
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{metrics?.totalRequests?.toLocaleString() || '0'}</div>
                  <p className="text-white/60 text-xs">All time requests</p>
                </CardContent>
              </Card>
              
              <Card className="bg-white/5 border-white/20 backdrop-blur-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-blue-400" />
                    Success Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {metrics ? Math.round((metrics.successfulRequests / metrics.totalRequests) * 100) : 0}%
                  </div>
                  <p className="text-white/60 text-xs">Successful responses</p>
                </CardContent>  
              </Card>

              <Card className="bg-white/5 border-white/20 backdrop-blur-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    Avg Response Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{metrics?.averageResponseTime || 0}ms</div>
                  <p className="text-white/60 text-xs">Average latency</p>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/20 backdrop-blur-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-purple-400" />
                    Active Keys
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">
                    {apiKeys.filter((key: ApiKey) => key.status === 'active').length}
                  </div>
                  <p className="text-white/60 text-xs">Currently active</p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Start Guide */}
            <Card className="bg-white/5 border-white/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Book className="h-5 w-5 text-blue-400" />
                  Quick Start Guide
                </CardTitle>
                <CardDescription className="text-white/70">
                  Get started with Tapt API integration in minutes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-white flex items-center gap-2">
                      <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">1</span>
                      Create API Key
                    </h4>
                    <p className="text-white/60 text-sm">Generate your first API key with the required permissions for your ecommerce platform.</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-white flex items-center gap-2">
                      <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">2</span>
                      Configure Webhooks
                    </h4>
                    <p className="text-white/60 text-sm">Set up webhook endpoints to receive real-time payment status updates.</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-white flex items-center gap-2">
                      <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm">3</span>
                      Start Accepting Payments
                    </h4>
                    <p className="text-white/60 text-sm">Integrate with your store and start accepting payments through Tapt.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="keys" className="space-y-6">
            <Card className="bg-white/5 border-white/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white">API Keys</CardTitle>
                <CardDescription className="text-white/70">
                  Manage your API keys for ecommerce integrations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {keysLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
                    <p className="text-white/60 mt-2">Loading API keys...</p>
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-8">
                    <Key className="h-12 w-12 text-white/40 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">No API keys yet</h3>
                    <p className="text-white/60 mb-4">Create your first API key to start integrating with ecommerce platforms.</p>
                    <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-blue-500/80 border-blue-400/50 text-white hover:bg-blue-500">
                      <Plus className="h-4 w-4 mr-2" />
                      Create API Key
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {apiKeys.map((key: ApiKey) => (
                      <div key={key.id} className="bg-white/5 border border-white/20 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-medium text-white">{key.keyName}</h4>
                            <p className="text-white/60 text-sm">
                              Created {format(new Date(key.createdAt), "MMM dd, yyyy")}
                              {key.lastUsedAt && ` • Last used ${format(new Date(key.lastUsedAt), "MMM dd, yyyy")}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={key.environment === 'live' ? 'default' : 'secondary'}>
                              {key.environment}
                            </Badge>
                            <Badge variant={key.status === 'active' ? 'default' : 'secondary'}>
                              {key.status}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1 bg-white/10 border border-white/20 rounded-lg p-2 font-mono text-sm text-white">
                            {showApiKey[key.id] ? key.keyPrefix + '...' + 'sk_live_abcd1234' : key.keyPrefix + '••••••••••••••••'}
                          </div>
                          <Button
                            onClick={() => toggleApiKeyVisibility(key.id)}
                            variant="outline"
                            size="sm"
                            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                          >
                            {showApiKey[key.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            onClick={() => copyToClipboard(key.keyPrefix + 'sk_live_example_key')}
                            variant="outline"
                            size="sm"
                            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <div className="text-white/60">
                            Permissions: {key.permissions.join(', ')} • {key.rateLimitPerHour}/hour limit
                          </div>
                          {key.status === 'active' && (
                            <Button
                              onClick={() => revokeKeyMutation.mutate(key.id)}
                              variant="outline"
                              size="sm"
                              className="bg-red-500/20 border-red-400/30 text-red-300 hover:bg-red-500/30"
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-6">
            <Card className="bg-white/5 border-white/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white">Webhook Management</CardTitle>
                <CardDescription className="text-white/70">
                  Monitor webhook deliveries and configure endpoints
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Webhook className="h-12 w-12 text-white/40 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Webhook monitoring coming soon</h3>
                  <p className="text-white/60">Real-time webhook delivery tracking and retry management will be available here.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="docs" className="space-y-6">
            <Card className="bg-white/5 border-white/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white">API Documentation</CardTitle>
                <CardDescription className="text-white/70">
                  Complete integration guide and API reference
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* API Endpoints */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Core Endpoints</h3>
                  <div className="space-y-3">
                    <div className="bg-white/5 border border-white/20 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className="bg-green-500/20 text-green-300">POST</Badge>
                        <code className="text-white font-mono">/api/v1/transactions</code>
                      </div>
                      <p className="text-white/70 text-sm">Create a new payment transaction</p>
                    </div>
                    <div className="bg-white/5 border border-white/20 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className="bg-blue-500/20 text-blue-300">GET</Badge>
                        <code className="text-white font-mono">/api/v1/transactions/:id</code>
                      </div>
                      <p className="text-white/70 text-sm">Get transaction status and details</p>
                    </div>
                    <div className="bg-white/5 border border-white/20 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className="bg-orange-500/20 text-orange-300">POST</Badge>
                        <code className="text-white font-mono">/api/v1/refunds</code>
                      </div>
                      <p className="text-white/70 text-sm">Process a refund for a transaction</p>
                    </div>
                  </div>
                </div>

                {/* Code Example */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Example Request</h3>
                  <div className="bg-black/50 border border-white/20 rounded-lg p-4">
                    <pre className="text-green-400 text-sm overflow-x-auto">
{`curl -X POST https://api.tapt.co.nz/v1/transactions \\
  -H "Authorization: Bearer tapt_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": "10.50",
    "currency": "NZD",
    "item_name": "Coffee",
    "customer_email": "customer@example.com",
    "return_url": "https://yourstore.com/success",
    "webhook_url": "https://yourstore.com/webhooks/tapt"
  }'`}
                    </pre>
                  </div>
                </div>

                {/* External Documentation */}
                <div className="flex gap-3">
                  <Button 
                    onClick={() => window.open('https://docs.tapt.co.nz', '_blank')}
                    variant="outline"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Full Documentation
                  </Button>
                  <Button 
                    onClick={() => window.open('https://github.com/tapt-nz/examples', '_blank')}
                    variant="outline"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    <Code className="h-4 w-4 mr-2" />
                    Code Examples
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
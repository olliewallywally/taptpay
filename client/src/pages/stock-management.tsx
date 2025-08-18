import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Package, 
  Plus, 
  Edit, 
  Trash2, 
  ShoppingCart,
  DollarSign,
  FileText,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StockItem {
  id: number;
  merchantId: number;
  name: string;
  description: string;
  cost: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function StockManagement() {
  const [, setLocation] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    cost: ""
  });
  const { toast } = useToast();

  // Get current user/merchant
  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const merchantId = user?.user?.merchantId;

  // Fetch stock items
  const { data: stockItems, isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    enabled: !!merchantId,
  });

  // Create stock item mutation
  const createStockMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; cost: string }) => {
      return apiRequest(`/api/merchants/${merchantId}/stock-items`, {
        method: 'POST',
        body: data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Item Created",
        description: "Stock item has been added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create stock item",
        variant: "destructive",
      });
    },
  });

  // Update stock item mutation
  const updateStockMutation = useMutation({
    mutationFn: async (data: { id: number; name: string; description: string; cost: string }) => {
      return apiRequest(`/api/merchants/${merchantId}/stock-items/${data.id}`, {
        method: 'PUT',
        body: { name: data.name, description: data.description, cost: data.cost }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      setEditingItem(null);
      resetForm();
      toast({
        title: "Item Updated",
        description: "Stock item has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update stock item",
        variant: "destructive",
      });
    },
  });

  // Delete stock item mutation
  const deleteStockMutation = useMutation({
    mutationFn: async (itemId: number) => {
      return apiRequest(`/api/merchants/${merchantId}/stock-items/${itemId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      toast({
        title: "Item Deleted",
        description: "Stock item has been removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete stock item",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", cost: "" });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.cost) {
      toast({
        title: "Validation Error",
        description: "Name and cost are required",
        variant: "destructive",
      });
      return;
    }

    if (editingItem) {
      updateStockMutation.mutate({
        id: editingItem.id,
        ...formData
      });
    } else {
      createStockMutation.mutate(formData);
    }
  };

  const handleEdit = (item: StockItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description,
      cost: item.cost
    });
  };

  const filteredItems = stockItems?.filter((item: StockItem) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-4">Please log in to access stock management.</p>
          <Button onClick={() => setLocation("/login")}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-r from-green-300 to-emerald-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" />
        <div className="absolute top-40 right-20 w-96 h-96 bg-gradient-to-r from-emerald-300 to-teal-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-75" />
        <div className="absolute -bottom-8 left-40 w-96 h-96 bg-gradient-to-r from-teal-300 to-green-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-150" />
      </div>

      <div className="relative z-10 p-4 lg:p-8">
        {/* Header */}
        <div className="max-w-7xl mx-auto mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Stock Management</h1>
              <p className="text-gray-600 mt-1">Manage your inventory and product catalog</p>
            </div>
            
            {/* Navigation Menu */}
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                onClick={() => setLocation("/dashboard")}
                className="bg-white/50 backdrop-blur-sm border-white/20 hover:bg-white/70"
              >
                Dashboard
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setLocation("/merchant-terminal")}
                className="bg-white/50 backdrop-blur-sm border-white/20 hover:bg-white/70"
              >
                Terminal
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setLocation("/transactions")}
                className="bg-white/50 backdrop-blur-sm border-white/20 hover:bg-white/70"
              >
                Transactions
              </Button>
              <Button 
                variant="default"
                className="bg-green-600 hover:bg-green-700"
              >
                Stock
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          {/* Search and Create Bar */}
          <div className="mb-8">
            <Card className="backdrop-blur-xl bg-white/20 border border-white/30 shadow-2xl">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search stock items..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-white/50 backdrop-blur-sm border-white/20"
                    />
                  </div>
                  
                  <Dialog open={isCreateDialogOpen || !!editingItem} onOpenChange={(open) => {
                    if (!open) {
                      setIsCreateDialogOpen(false);
                      setEditingItem(null);
                      resetForm();
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button 
                        onClick={() => setIsCreateDialogOpen(true)}
                        className="bg-green-600 hover:bg-green-700 text-white shadow-lg"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Item
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>
                          {editingItem ? "Edit Stock Item" : "Create New Stock Item"}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">
                            Item Name *
                          </label>
                          <Input
                            placeholder="Enter item name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          />
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">
                            Description
                          </label>
                          <Textarea
                            placeholder="Enter item description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                          />
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">
                            Cost *
                          </label>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={formData.cost}
                              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                              className="pl-10"
                            />
                          </div>
                        </div>
                        
                        <div className="flex gap-3 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsCreateDialogOpen(false);
                              setEditingItem(null);
                              resetForm();
                            }}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSubmit}
                            disabled={createStockMutation.isPending || updateStockMutation.isPending}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            {(createStockMutation.isPending || updateStockMutation.isPending) 
                              ? "Saving..." 
                              : editingItem ? "Update" : "Create"
                            }
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stock Items Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="backdrop-blur-xl bg-white/20 border border-white/30 shadow-2xl">
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
                      <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
                      <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item: StockItem) => (
                <Card key={item.id} className="backdrop-blur-xl bg-white/20 border border-white/30 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                          <Package className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-lg font-semibold text-gray-900 line-clamp-1">
                            {item.name}
                          </CardTitle>
                          <Badge variant="outline" className="mt-1 bg-green-50 text-green-700 border-green-200">
                            <ShoppingCart className="w-3 h-3 mr-1" />
                            In Stock
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(item)}
                          className="h-8 w-8 p-0 hover:bg-blue-100"
                        >
                          <Edit className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteStockMutation.mutate(item.id)}
                          className="h-8 w-8 p-0 hover:bg-red-100"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    {item.description && (
                      <div className="flex items-start space-x-2 mb-4">
                        <FileText className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="w-5 h-5 text-green-600" />
                        <span className="text-2xl font-bold text-green-600">
                          ${parseFloat(item.cost).toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="text-xs text-gray-500">
                        Added {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="backdrop-blur-xl bg-white/20 border border-white/30 shadow-2xl">
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {searchTerm ? "No items found" : "No stock items yet"}
                </h3>
                <p className="text-gray-600 mb-6">
                  {searchTerm 
                    ? "Try adjusting your search terms" 
                    : "Start building your inventory by creating your first stock item"
                  }
                </p>
                {!searchTerm && (
                  <Button 
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Item
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
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
  Search,
  Menu,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentMerchantId } from "@/lib/auth";
import taptLogoPath from "@assets/tapt logo v2_1751682549877.png";

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
  const [menuOpen, setMenuOpen] = useState(false);
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

  const merchantId = getCurrentMerchantId();

  // Fetch stock items
  const { data: stockItems, isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    enabled: !!merchantId,
  });

  // Create stock item mutation
  const createStockMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; cost: string }) => {
      return apiRequest("POST", `/api/merchants/${merchantId}/stock-items`, data);
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
      return apiRequest("PUT", `/api/merchants/${merchantId}/stock-items/${data.id}`, { 
        name: data.name, 
        description: data.description, 
        cost: data.cost 
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
      return apiRequest("DELETE", `/api/merchants/${merchantId}/stock-items/${itemId}`);
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

  const filteredItems = (stockItems as StockItem[] || []).filter((item: StockItem) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <>
      {/* Menu Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Sliding Menu */}
      <div 
        className={`fixed right-0 top-0 h-full w-80 bg-gray-800 border-l border-gray-700 z-50 transform transition-transform duration-300 ease-in-out ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-white">Menu</h2>
            <button onClick={() => setMenuOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="space-y-4">
            <Link href="/dashboard" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
              Dashboard
            </Link>
            <Link href="/merchant-terminal" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
              Terminal
            </Link>
            <Link href="/transactions" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
              Transactions
            </Link>
            <Link href="/stock" className="block py-3 px-4 text-[#00CC52] rounded-xl font-medium">
              Stock
            </Link>
            <Link href="/settings" className="block py-3 px-4 text-white hover:text-white rounded-xl transition-colors">
              Settings
            </Link>
            <div className="pt-4 mt-4 border-t border-gray-600">
              <button 
                onClick={() => {
                  localStorage.removeItem('auth-token');
                  window.location.href = '/login';
                }}
                className="block w-full text-left py-3 px-4 text-red-400 hover:text-red-300 rounded-xl transition-colors"
              >
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>

      <div 
        className={`min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 transform transition-transform duration-300 ease-in-out ${
          menuOpen ? '-translate-x-80' : 'translate-x-0'
        }`}
      >


        {/* Menu Icon */}
        <div className="fixed top-4 right-4 z-30">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white hover:bg-black/60 transition-colors"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {/* Tapt Pay Branding */}
        <div className="fixed top-4 left-4 z-30">
          <img 
            src={taptLogoPath} 
            alt="TaptPay" 
            className="h-8 w-auto object-contain"
          />
        </div>

        <div className="relative z-10 p-4 lg:p-8">
          {/* Header */}
          <div className="max-w-7xl mx-auto mb-8 pt-16">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-white">Stock Management</h1>
                <p className="text-gray-400 mt-1">Manage your inventory and product catalog</p>
              </div>
            </div>
          </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          {/* Search and Create Bar */}
          <div className="mb-8">
            <Card className="dashboard-card-glass backdrop-blur-xl bg-black/40 border border-white/20 shadow-2xl">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search stock items..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-black/40 backdrop-blur-sm border-white/20 text-white placeholder:text-gray-500"
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
                        className="bg-[#00FF66] hover:bg-[#00CC52] text-black font-medium shadow-lg"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Item
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-gray-800/90 border-gray-600/50 backdrop-blur-xl">
                      <DialogHeader>
                        <DialogTitle className="text-white">
                          {editingItem ? "Edit Stock Item" : "Create New Stock Item"}
                        </DialogTitle>
                        <DialogDescription className="text-gray-300">
                          {editingItem ? "Update the details of your stock item." : "Add a new item to your inventory."}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-white mb-1 block">
                            Item Name *
                          </label>
                          <Input
                            placeholder="Enter item name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="bg-gray-700/80 border-gray-600/50 text-white placeholder:text-gray-400"
                          />
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium text-white mb-1 block">
                            Description
                          </label>
                          <Textarea
                            placeholder="Enter item description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                            className="bg-gray-700/80 border-gray-600/50 text-white placeholder:text-gray-400"
                          />
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium text-white mb-1 block">
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
                              className="pl-10 bg-gray-700/80 border-gray-600/50 text-white placeholder:text-gray-400"
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
                            className="flex-1 bg-[#00FF66] hover:bg-[#00CC52] text-black font-medium"
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
                <Card key={i} className="dashboard-card-glass backdrop-blur-xl bg-black/40 border border-white/20 shadow-2xl">
                  <CardContent className="p-6">
                    <div className="animate-pulse">
                      <div className="h-6 bg-gray-600 rounded w-3/4 mb-3"></div>
                      <div className="h-4 bg-gray-600 rounded w-full mb-2"></div>
                      <div className="h-4 bg-gray-600 rounded w-2/3 mb-4"></div>
                      <div className="h-8 bg-gray-600 rounded w-1/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item: StockItem) => (
                <Card key={item.id} className="dashboard-card-glass backdrop-blur-xl bg-black/40 border border-white/20 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-[#00FF66] to-[#00CC52] rounded-xl flex items-center justify-center shadow-lg drop-shadow-[0_0_8px_#00FF66]">
                          <Package className="w-6 h-6 text-black" />
                        </div>
                        <div>
                          <CardTitle className="text-lg font-semibold text-white line-clamp-1">
                            {item.name}
                          </CardTitle>
                          <Badge variant="outline" className="mt-1 bg-[#00FF66]/20 text-[#00FF66] border-[#00FF66]/30">
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
                          className="h-8 w-8 p-0 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteStockMutation.mutate(item.id)}
                          className="h-8 w-8 p-0 hover:bg-red-500/20 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    {item.description && (
                      <div className="flex items-start space-x-2 mb-4">
                        <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-gray-300 line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="w-5 h-5 text-[#00FF66] drop-shadow-[0_0_8px_#00FF66]" />
                        <span className="text-2xl font-bold text-[#00FF66]">
                          ${parseFloat(item.cost).toFixed(2)}
                        </span>
                      </div>
                      
                      <div className="text-xs text-gray-400">
                        Added {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="dashboard-card-glass backdrop-blur-xl bg-black/40 border border-white/20 shadow-2xl">
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-[#00FF66] to-[#00CC52] rounded-full flex items-center justify-center mx-auto mb-4 drop-shadow-[0_0_8px_#00FF66]">
                  <Package className="w-8 h-8 text-black" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {searchTerm ? "No items found" : "No stock items yet"}
                </h3>
                <p className="text-gray-300 mb-6">
                  {searchTerm 
                    ? "Try adjusting your search terms" 
                    : "Start building your inventory by creating your first stock item"
                  }
                </p>
                {!searchTerm && (
                  <Button 
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="bg-[#00FF66] hover:bg-[#00CC52] text-black font-medium"
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
    </>
  );
}
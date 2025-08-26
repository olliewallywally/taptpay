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
import taptLogoPath from "@assets/IMG_6592_1755070818452.png";

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
  const { data: stockItems, isLoading, error } = useQuery({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/stock-items`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
          "Content-Type": "application/json"
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch stock items: ${response.statusText}`);
      }
      return response.json();
    },
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
            className="p-2 sm:p-3 backdrop-blur-xl bg-black/40 border border-white/20 rounded-xl text-white hover:bg-black/60 transition-colors"
          >
            <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        {/* Tapt Pay Branding */}
        <div className="fixed top-4 left-4 z-30">
          <img 
            src={taptLogoPath} 
            alt="TaptPay" 
            className="h-6 sm:h-8 w-auto object-contain"
          />
        </div>

        <div className="relative z-10 p-4 lg:p-8">
          {/* Header */}
          <div className="max-w-7xl mx-auto mb-6 sm:mb-8 pt-16 sm:pt-20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Stock Management</h1>
                <p className="text-sm sm:text-base text-gray-400 mt-1">Manage your inventory and product catalog</p>
              </div>
            </div>
          </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4">
          {/* Header Section - Green Box */}
          <div className="mb-4 sm:mb-6">
            <div className="rounded-2xl p-4 sm:p-6" style={{ backgroundColor: '#00FF66' }}>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 w-4 h-4" />
                  <Input
                    placeholder="Search stock items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white border-0 text-black placeholder:text-gray-600 rounded-lg"
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
                      className="bg-black hover:bg-gray-800 text-white font-medium rounded-lg w-full sm:w-auto border-0"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      <span>Create Item</span>
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
            </div>
          </div>


          {/* Stock Items Grid - 2 Column Mobile Design */}
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-2xl p-4" style={{ backgroundColor: '#3a3a3a' }}>
                  <div className="animate-pulse">
                    <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-600 rounded w-1/2 mb-3"></div>
                    <div className="h-6 bg-gray-600 rounded w-2/3"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {filteredItems.map((item: StockItem) => (
                <div key={item.id} className="rounded-2xl p-4 hover:scale-105 transition-transform duration-200 cursor-pointer" style={{ backgroundColor: '#3a3a3a' }}>
                  <div className="flex flex-col h-full">
                    {/* Top right buttons - UPDATED */}
                    <div className="flex justify-end mb-1">
                      <div className="flex gap-0">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-0.5 hover:bg-white/20 rounded-sm text-white transition-colors"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteStockMutation.mutate(item.id)}
                          className="p-0.5 hover:bg-white/20 rounded-sm text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Header with icon and full text */}
                    <div className="flex items-center space-x-2 mb-2">
                      <Package className="w-4 h-4 text-white flex-shrink-0" />
                      <span className="text-sm font-medium text-white leading-tight">{item.name}</span>
                    </div>
                    
                    {/* Description */}
                    {item.description && (
                      <p className="text-xs text-gray-300 mb-3 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    
                    {/* Price */}
                    <div className="mt-auto">
                      <div className="flex items-center space-x-1">
                        <DollarSign className="w-4 h-4 text-white" />
                        <span className="text-lg font-bold text-white">
                          ${parseFloat(item.cost).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: '#3a3a3a' }}>
              <Package className="w-12 h-12 text-white mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">
                {searchTerm ? "No items found" : "No stock items yet"}
              </h3>
              <p className="text-gray-300 mb-6 text-sm">
                {searchTerm 
                  ? "Try adjusting your search terms" 
                  : "Start building your inventory by creating your first stock item"
                }
              </p>
              {!searchTerm && (
                <Button 
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="bg-black hover:bg-gray-800 text-white font-medium rounded-lg"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Item
                </Button>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
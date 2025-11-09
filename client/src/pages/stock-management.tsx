import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import { Home, Package, BarChart3, SlidersHorizontal, Terminal, Search, Plus, ChevronRight, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface StockItem {
  id: number;
  name: string;
  price: string;
  description?: string;
}

export default function StockManagement() {
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "", description: "" });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const merchantId = getCurrentMerchantId();

  if (!merchantId) {
    setLocation('/login');
    return null;
  }

  const { data: stockItems = [], isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/stock-items`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch stock items");
      return response.json();
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (item: typeof newItem) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/stock-items`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(item),
      });
      if (!response.ok) throw new Error("Failed to add stock item");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      setNewItem({ name: "", price: "", description: "" });
      setIsDialogOpen(false);
      toast({ title: "Product added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add product", variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (item: StockItem) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/stock-items/${item.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ name: item.name, price: item.price, description: item.description }),
      });
      if (!response.ok) throw new Error("Failed to update stock item");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      setIsEditDialogOpen(false);
      setEditingItem(null);
      toast({ title: "Product updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update product", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/stock-items/${itemId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete stock item");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      setIsEditDialogOpen(false);
      setEditingItem(null);
      toast({ title: "Product deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete product", variant: "destructive" });
    },
  });

  const handleAddStock = () => {
    if (!newItem.name || !newItem.price) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    addItemMutation.mutate(newItem);
  };

  const handleUpdateStock = () => {
    if (!editingItem || !editingItem.name || !editingItem.price) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    updateItemMutation.mutate(editingItem);
  };

  const handleDeleteStock = () => {
    if (!editingItem) return;
    deleteItemMutation.mutate(editingItem.id);
  };

  const handleEditClick = (item: StockItem) => {
    setEditingItem(item);
    setIsEditDialogOpen(true);
  };

  const filteredStock = stockItems.filter((item: StockItem) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gray-200 pb-24">
      {/* Header Section */}
      <div className="relative">
        <div className="absolute left-0 right-0 h-[80px] sm:h-[106px] bg-[#00E5CC] rounded-b-[60px] sm:rounded-b-[100px] z-0" style={{ bottom: '-20px' }}></div>
        
        <div className="bg-[#0055FF] pt-6 sm:pt-8 pb-10 sm:pb-12 rounded-b-[60px] sm:rounded-b-[100px] relative z-10">
          <div className="max-w-md md:max-w-2xl mx-auto px-4 sm:px-6">
            <h1 className="text-[#00E5CC] text-center text-xl sm:text-2xl md:text-3xl mb-8">inventory</h1>
            
            {/* Search Bar */}
            <div className="relative mb-6">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/10 backdrop-blur-sm border border-[#00E5CC]/30 rounded-full px-5 py-3 pl-12 text-white placeholder-[#00E5CC]/60 focus:outline-none focus:border-[#00E5CC]"
                data-testid="input-search"
              />
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#00E5CC]" size={20} />
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
                <div className="text-[#00E5CC] text-2xl sm:text-3xl" data-testid="text-total-items">{stockItems.length}</div>
                <div className="text-[#00E5CC]/70 text-xs sm:text-sm mt-1">Total Items</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
                <div className="text-yellow-400 text-2xl sm:text-3xl">${stockItems.reduce((sum: number, item: StockItem) => sum + parseFloat(item.price || '0'), 0).toFixed(2)}</div>
                <div className="text-[#00E5CC]/70 text-xs sm:text-sm mt-1">Total Value</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
                <div className="text-[#00E5CC] text-2xl sm:text-3xl">{filteredStock.length}</div>
                <div className="text-[#00E5CC]/70 text-xs sm:text-sm mt-1">Showing</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stock Items List */}
      <div className="max-w-md md:max-w-2xl mx-auto px-4 sm:px-6 mt-[40px] sm:mt-[50px] relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#3B3D53] text-lg sm:text-xl">Products</h2>
          <button 
            onClick={() => setIsDialogOpen(true)}
            className="bg-[#0055FF] text-white rounded-full p-2 sm:p-3 hover:bg-[#0044DD] transition-colors shadow-lg"
            data-testid="button-add-product"
          >
            <Plus size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-[#3B3D53]">Loading...</div>
        ) : filteredStock.length === 0 ? (
          <div className="text-center py-12 text-[#3B3D53]">
            {searchQuery ? "No products found matching your search" : "No products yet. Add your first product!"}
          </div>
        ) : (
          <div className="space-y-3 mb-8">
            {filteredStock.map((item: StockItem) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleEditClick(item)}
                data-testid={`card-product-${item.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-[#3B3D53] text-base sm:text-lg mb-1">{item.name}</h3>
                    {item.description && (
                      <div className="text-[#161A41]/50 text-sm mb-2">{item.description}</div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="text-[#0055FF] text-lg sm:text-xl font-semibold">${parseFloat(item.price).toFixed(2)}</div>
                    </div>
                  </div>
                  <button className="text-[#0055FF] hover:text-[#0044DD] transition-colors">
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Stock Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-white rounded-3xl max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="text-[#0055FF] text-xl">Add New Product</DialogTitle>
            <DialogDescription className="text-gray-600">
              Enter the details for the new product to add to your inventory.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="productName" className="text-gray-700">Product Name *</Label>
              <Input
                id="productName"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="e.g. Wireless Earbuds"
                className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                data-testid="input-product-name"
              />
            </div>

            <div>
              <Label htmlFor="price" className="text-gray-700">Price ($) *</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={newItem.price}
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                placeholder="0.00"
                className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                data-testid="input-price"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-gray-700">Description</Label>
              <Input
                id="description"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Optional description"
                className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                data-testid="input-description"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setNewItem({ name: "", price: "", description: "" });
                }}
                className="flex-1 border-[#0055FF]/30 text-[#0055FF] hover:bg-[#0055FF]/10"
                data-testid="button-cancel-add"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddStock}
                disabled={addItemMutation.isPending}
                className="flex-1 bg-[#0055FF] hover:bg-[#0044DD] text-white"
                data-testid="button-confirm-add"
              >
                {addItemMutation.isPending ? "Adding..." : "Add Product"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Stock Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-white rounded-3xl max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="text-[#0055FF] text-xl">Edit Product</DialogTitle>
            <DialogDescription className="text-gray-600">
              Update the product details or delete it from your inventory.
            </DialogDescription>
          </DialogHeader>
          
          {editingItem && (
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="editProductName" className="text-gray-700">Product Name *</Label>
                <Input
                  id="editProductName"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="e.g. Wireless Earbuds"
                  className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                  data-testid="input-edit-name"
                />
              </div>

              <div>
                <Label htmlFor="editPrice" className="text-gray-700">Price ($) *</Label>
                <Input
                  id="editPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingItem.price}
                  onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
                  placeholder="0.00"
                  className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                  data-testid="input-edit-price"
                />
              </div>

              <div>
                <Label htmlFor="editDescription" className="text-gray-700">Description</Label>
                <Input
                  id="editDescription"
                  value={editingItem.description || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="Optional description"
                  className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                  data-testid="input-edit-description"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleDeleteStock}
                  disabled={deleteItemMutation.isPending}
                  className="border-red-500/30 text-red-500 hover:bg-red-500/10 gap-2"
                  data-testid="button-delete"
                >
                  <Trash2 size={16} />
                  {deleteItemMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingItem(null);
                  }}
                  className="flex-1 border-[#0055FF]/30 text-[#0055FF] hover:bg-[#0055FF]/10"
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateStock}
                  disabled={updateItemMutation.isPending}
                  className="flex-1 bg-[#0055FF] hover:bg-[#0044DD] text-white"
                  data-testid="button-update"
                >
                  {updateItemMutation.isPending ? "Updating..." : "Update"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2C2C2E] rounded-t-[24px] sm:rounded-t-[32px] md:rounded-t-[40px] px-4 sm:px-8 md:px-12 py-4 sm:py-6 md:py-8 z-50">
        <div className="max-w-md md:max-w-2xl mx-auto flex items-center justify-between gap-2 md:gap-4">
          <button 
            onClick={() => setLocation('/dashboard')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
            data-testid="nav-dashboard"
          >
            <Home className="text-white" size={20} />
          </button>
          <button 
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-[#0055FF] rounded-xl sm:rounded-2xl md:rounded-3xl"
            data-testid="nav-inventory"
          >
            <Package className="text-white" size={20} />
          </button>
          <button 
            onClick={() => setLocation('/demo-terminal')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
            data-testid="nav-terminal"
          >
            <Terminal className="text-white" size={20} />
          </button>
          <button 
            onClick={() => setLocation('/transactions')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
            data-testid="nav-analytics"
          >
            <BarChart3 className="text-white" size={20} />
          </button>
          <button 
            onClick={() => setLocation('/settings')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 hover:bg-gray-700 rounded-xl sm:rounded-2xl md:rounded-3xl transition-colors"
            data-testid="nav-settings"
          >
            <SlidersHorizontal className="text-white" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

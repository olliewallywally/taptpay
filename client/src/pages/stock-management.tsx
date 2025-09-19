import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit2, Trash2, Package } from "lucide-react";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

export default function StockManagement() {
  const [newItem, setNewItem] = useState({ name: "", price: "", description: "" });
  const [editingItem, setEditingItem] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const merchantId = getCurrentMerchantId();

  // Get stock items
  const { data: stockItems, isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "stock-items"],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${merchantId}/stock-items`);
      if (!response.ok) throw new Error("Failed to fetch stock items");
      return response.json();
    },
    enabled: !!merchantId,
  });

  // Add stock item mutation
  const addItemMutation = useMutation({
    mutationFn: async (item: typeof newItem) => {
      const response = await fetch(`/api/merchants/${merchantId}/stock-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!response.ok) throw new Error("Failed to add stock item");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      setNewItem({ name: "", price: "", description: "" });
      toast({ title: "Success", description: "Stock item added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add stock item", variant: "destructive" });
    },
  });

  // Delete stock item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const response = await fetch(`/api/merchants/${merchantId}/stock-items/${itemId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete stock item");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "stock-items"] });
      toast({ title: "Success", description: "Stock item deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete stock item", variant: "destructive" });
    },
  });

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim() || !newItem.price.trim()) {
      toast({ title: "Error", description: "Name and price are required", variant: "destructive" });
      return;
    }
    addItemMutation.mutate(newItem);
  };

  const handleDeleteItem = (itemId: number) => {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteItemMutation.mutate(itemId);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center space-x-3 mb-8">
        <Package className="h-8 w-8 text-green-500" />
        <h1 className="text-3xl font-bold text-white">Stock Management</h1>
      </div>

      {/* Add New Item Form */}
      <Card className="mb-8 bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>Add New Stock Item</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="name" className="text-gray-300">Item Name</Label>
                <Input
                  id="name"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="Enter item name"
                  className="bg-gray-700 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="price" className="text-gray-300">Price ($)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                  placeholder="0.00"
                  className="bg-gray-700 border-gray-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="description" className="text-gray-300">Description</Label>
                <Input
                  id="description"
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder="Optional description"
                  className="bg-gray-700 border-gray-600 text-white"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              disabled={addItemMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {addItemMutation.isPending ? "Adding..." : "Add Item"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Stock Items List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stockItems && stockItems.length > 0 ? (
          stockItems.map((item: any) => (
            <Card key={item.id} className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingItem(item)}
                      className="border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={deleteItemMutation.isPending}
                      className="border-red-600 text-red-400 hover:bg-red-950"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-2xl font-bold text-green-500 mb-2">${parseFloat(item.price).toFixed(2)}</p>
                {item.description && (
                  <p className="text-gray-400 text-sm">{item.description}</p>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="bg-gray-800 border-gray-700 md:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center">
              <Package className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">No stock items yet</p>
              <p className="text-gray-500 text-sm">Add your first item using the form above</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
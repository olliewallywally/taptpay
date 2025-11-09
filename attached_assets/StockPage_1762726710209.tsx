import { useState, useEffect } from 'react';
import { Home, Package, Receipt, BarChart3, SlidersHorizontal, Search, Plus, ChevronRight, Trash2 } from 'lucide-react';
import terminalIcon from 'figma:asset/334c2b7e95367d5970568548bd4fac0acb30be47.png';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface StockPageProps {
  user: any;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

interface StockItem {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
}

const initialStockData: StockItem[] = [
  { id: 1, name: 'Wireless Earbuds', sku: 'WE-001', quantity: 145, price: 79.99, status: 'in-stock' },
  { id: 2, name: 'Phone Case Premium', sku: 'PC-234', quantity: 8, price: 24.99, status: 'low-stock' },
  { id: 3, name: 'USB-C Cable', sku: 'UC-567', quantity: 0, price: 15.99, status: 'out-of-stock' },
  { id: 4, name: 'Screen Protector', sku: 'SP-890', quantity: 230, price: 12.99, status: 'in-stock' },
  { id: 5, name: 'Power Bank 20000mAh', sku: 'PB-123', quantity: 45, price: 49.99, status: 'in-stock' },
  { id: 6, name: 'Bluetooth Speaker', sku: 'BS-456', quantity: 5, price: 89.99, status: 'low-stock' },
  { id: 7, name: 'Smartwatch Band', sku: 'SB-789', quantity: 78, price: 19.99, status: 'in-stock' },
  { id: 8, name: 'Car Charger', sku: 'CC-012', quantity: 120, price: 16.99, status: 'in-stock' },
];

export function StockPage({ user, onNavigate, onLogout }: StockPageProps) {
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [newItem, setNewItem] = useState({
    name: '',
    sku: '',
    quantity: '',
    price: '',
  });

  useEffect(() => {
    loadStock();
  }, []);

  const loadStock = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/stock`,
        {
          headers: {
            Authorization: `Bearer ${accessToken || publicAnonKey}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStockData(data.stock || initialStockData);
      } else {
        // If no data exists, use initial data
        setStockData(initialStockData);
      }
    } catch (error) {
      console.error('Error loading stock:', error);
      setStockData(initialStockData);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = async () => {
    if (!newItem.name || !newItem.sku || !newItem.quantity || !newItem.price) {
      toast.error('Please fill in all fields');
      return;
    }

    const quantity = parseInt(newItem.quantity);
    const price = parseFloat(newItem.price);

    if (isNaN(quantity) || quantity < 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    if (isNaN(price) || price < 0) {
      toast.error('Please enter a valid price');
      return;
    }

    let status: 'in-stock' | 'low-stock' | 'out-of-stock' = 'in-stock';
    if (quantity === 0) {
      status = 'out-of-stock';
    } else if (quantity <= 10) {
      status = 'low-stock';
    }

    const newStockItem: StockItem = {
      id: Date.now(),
      name: newItem.name,
      sku: newItem.sku,
      quantity,
      price,
      status,
    };

    const updatedStock = [...stockData, newStockItem];

    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/stock`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken || publicAnonKey}`,
          },
          body: JSON.stringify({ stock: updatedStock }),
        }
      );

      if (response.ok) {
        setStockData(updatedStock);
        setIsDialogOpen(false);
        setNewItem({ name: '', sku: '', quantity: '', price: '' });
        toast.success('Product added successfully');
      } else {
        const error = await response.text();
        console.error('Error adding stock:', error);
        toast.error('Failed to add product');
      }
    } catch (error) {
      console.error('Error adding stock:', error);
      toast.error('Failed to add product');
    }
  };

  const handleEditClick = (item: StockItem) => {
    setEditingItem(item);
    setIsEditDialogOpen(true);
  };

  const handleUpdateStock = async () => {
    if (!editingItem) return;

    if (!editingItem.name || !editingItem.sku || editingItem.quantity < 0 || editingItem.price < 0) {
      toast.error('Please fill in all fields correctly');
      return;
    }

    let status: 'in-stock' | 'low-stock' | 'out-of-stock' = 'in-stock';
    if (editingItem.quantity === 0) {
      status = 'out-of-stock';
    } else if (editingItem.quantity <= 10) {
      status = 'low-stock';
    }

    const updatedItem = { ...editingItem, status };
    const updatedStock = stockData.map(item => 
      item.id === editingItem.id ? updatedItem : item
    );

    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/stock`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken || publicAnonKey}`,
          },
          body: JSON.stringify({ stock: updatedStock }),
        }
      );

      if (response.ok) {
        setStockData(updatedStock);
        setIsEditDialogOpen(false);
        setEditingItem(null);
        toast.success('Product updated successfully');
      } else {
        const error = await response.text();
        console.error('Error updating stock:', error);
        toast.error('Failed to update product');
      }
    } catch (error) {
      console.error('Error updating stock:', error);
      toast.error('Failed to update product');
    }
  };

  const handleDeleteStock = async () => {
    if (!editingItem) return;

    const updatedStock = stockData.filter(item => item.id !== editingItem.id);

    try {
      const accessToken = localStorage.getItem('accessToken');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/stock`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken || publicAnonKey}`,
          },
          body: JSON.stringify({ stock: updatedStock }),
        }
      );

      if (response.ok) {
        setStockData(updatedStock);
        setIsEditDialogOpen(false);
        setEditingItem(null);
        toast.success('Product deleted successfully');
      } else {
        const error = await response.text();
        console.error('Error deleting stock:', error);
        toast.error('Failed to delete product');
      }
    } catch (error) {
      console.error('Error deleting stock:', error);
      toast.error('Failed to delete product');
    }
  };

  const filteredStock = stockData.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalItems = filteredStock.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockCount = filteredStock.filter(item => item.status === 'low-stock').length;
  const outOfStockCount = filteredStock.filter(item => item.status === 'out-of-stock').length;

  const getStatusColor = (status: StockItem['status']) => {
    switch (status) {
      case 'in-stock':
        return 'text-[#00E5CC]';
      case 'low-stock':
        return 'text-yellow-500';
      case 'out-of-stock':
        return 'text-red-500';
    }
  };

  const getStatusBgColor = (status: StockItem['status']) => {
    switch (status) {
      case 'in-stock':
        return 'bg-[#00E5CC]/10';
      case 'low-stock':
        return 'bg-yellow-500/10';
      case 'out-of-stock':
        return 'bg-red-500/10';
    }
  };

  return (
    <div className="min-h-screen bg-gray-200 pb-24">
      {/* Header Section */}
      <div className="relative">
        {/* Cyan bottom accent */}
        <div className="absolute left-0 right-0 h-[80px] sm:h-[106px] bg-[#00E5CC] rounded-b-[60px] sm:rounded-b-[100px] z-0" style={{ bottom: '-20px' }}></div>
        
        {/* Blue box on top */}
        <div className="bg-[#0055FF] pt-6 sm:pt-8 pb-10 sm:pb-12 rounded-b-[60px] sm:rounded-b-[100px] relative z-10">
          <div className="max-w-md mx-auto px-4 sm:px-6">
            <h1 className="text-[#00E5CC] text-center text-xl sm:text-2xl mb-8">inventory</h1>
            
            {/* Search Bar */}
            <div className="relative mb-6">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/10 backdrop-blur-sm border border-[#00E5CC]/30 rounded-full px-5 py-3 pl-12 text-white placeholder-[#00E5CC]/60 focus:outline-none focus:border-[#00E5CC]"
              />
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#00E5CC]" size={20} />
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
                <div className="text-[#00E5CC] text-2xl">{totalItems}</div>
                <div className="text-[#00E5CC]/70 text-xs mt-1">Total Items</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
                <div className="text-yellow-400 text-2xl">{lowStockCount}</div>
                <div className="text-[#00E5CC]/70 text-xs mt-1">Low Stock</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-center">
                <div className="text-red-400 text-2xl">{outOfStockCount}</div>
                <div className="text-[#00E5CC]/70 text-xs mt-1">Out of Stock</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stock Items List */}
      <div className="max-w-md mx-auto px-4 sm:px-6 mt-[40px] sm:mt-[50px] relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#3B3D53] text-lg">Products</h2>
          <button 
            onClick={() => setIsDialogOpen(true)}
            className="bg-[#0055FF] text-white rounded-full p-2 hover:bg-[#0044DD] transition-colors shadow-lg"
          >
            <Plus size={20} />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[#3B3D53]">Loading...</div>
        ) : filteredStock.length === 0 ? (
          <div className="text-center py-12 text-[#3B3D53]">No products found</div>
        ) : (
          <div className="space-y-3 mb-8">
            {filteredStock.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-4 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleEditClick(item)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[#3B3D53]">{item.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBgColor(item.status)} ${getStatusColor(item.status)}`}>
                        {item.status.replace('-', ' ')}
                      </span>
                    </div>
                    <div className="text-[#161A41]/50 text-sm mb-2">SKU: {item.sku}</div>
                    <div className="flex items-center gap-4">
                      <div className="text-[#0055FF]">${item.price.toFixed(2)}</div>
                      <div className="text-[#161A41]/70 text-sm">Qty: {item.quantity}</div>
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
              <Label htmlFor="productName" className="text-gray-700">Product Name</Label>
              <Input
                id="productName"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="e.g. Wireless Earbuds"
                className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
              />
            </div>

            <div>
              <Label htmlFor="sku" className="text-gray-700">SKU</Label>
              <Input
                id="sku"
                value={newItem.sku}
                onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                placeholder="e.g. WE-001"
                className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity" className="text-gray-700">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                  placeholder="0"
                  className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                />
              </div>

              <div>
                <Label htmlFor="price" className="text-gray-700">Price ($)</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                  placeholder="0.00"
                  className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setNewItem({ name: '', sku: '', quantity: '', price: '' });
                }}
                className="flex-1 border-[#0055FF]/30 text-[#0055FF] hover:bg-[#0055FF]/10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddStock}
                className="flex-1 bg-[#0055FF] hover:bg-[#0044DD] text-white"
              >
                Add Product
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
                <Label htmlFor="editProductName" className="text-gray-700">Product Name</Label>
                <Input
                  id="editProductName"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="e.g. Wireless Earbuds"
                  className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                />
              </div>

              <div>
                <Label htmlFor="editSku" className="text-gray-700">SKU</Label>
                <Input
                  id="editSku"
                  value={editingItem.sku}
                  onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })}
                  placeholder="e.g. WE-001"
                  className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editQuantity" className="text-gray-700">Quantity</Label>
                  <Input
                    id="editQuantity"
                    type="number"
                    min="0"
                    value={editingItem.quantity}
                    onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="editPrice" className="text-gray-700">Price ($)</Label>
                  <Input
                    id="editPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingItem.price}
                    onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="border-[#0055FF]/30 focus:border-[#00E5CC] focus:ring-[#00E5CC] mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleDeleteStock}
                  className="border-red-500/30 text-red-500 hover:bg-red-500/10 gap-2"
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingItem(null);
                  }}
                  className="flex-1 border-[#0055FF]/30 text-[#0055FF] hover:bg-[#0055FF]/10"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateStock}
                  className="flex-1 bg-[#0055FF] hover:bg-[#0044DD] text-white"
                >
                  Update
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2C2C2E] rounded-t-[24px] sm:rounded-t-[32px] px-4 sm:px-8 py-4 sm:py-6 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <button 
            onClick={() => onNavigate('dashboard')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <Home className="text-white" size={20} />
          </button>
          <button className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-[#0055FF] rounded-xl sm:rounded-2xl">
            <Package className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('terminal')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <img src={terminalIcon} alt="Terminal" className="w-5 h-5 sm:w-6 sm:h-6 invert" />
          </button>
          <button 
            onClick={() => onNavigate('analytics')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <BarChart3 className="text-white" size={20} />
          </button>
          <button 
            onClick={() => onNavigate('settings')}
            className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 hover:bg-gray-700 rounded-xl sm:rounded-2xl transition-colors"
          >
            <SlidersHorizontal className="text-white" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

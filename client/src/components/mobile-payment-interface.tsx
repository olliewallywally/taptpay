import { useState, useEffect } from "react";
import { QrCode, Smartphone, Send, Edit, Split, MoreHorizontal, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MobilePaymentInterfaceProps {
  amount: string;
  itemName: string;
  merchantName: string;
  onPaymentProcess?: () => void;
  onEditTransaction?: (data: { name: string; item: string; price: string }) => void;
  onSplitBill?: (splits: number) => void;
}

export function MobilePaymentInterface({
  amount,
  itemName,
  merchantName,
  onPaymentProcess,
  onEditTransaction,
  onSplitBill
}: MobilePaymentInterfaceProps) {
  const [activeMode, setActiveMode] = useState<"QR" | "NFC">("QR");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    name: merchantName || "",
    item: itemName || "",
    price: amount || ""
  });

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuOpen && !(event.target as Element).closest('.menu-container')) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleActionClick = (action: string) => {
    if (activeAction === action) {
      setActiveAction(null);
    } else {
      setActiveAction(action);
    }
  };

  const handleEditSubmit = () => {
    onEditTransaction?.(editData);
    setActiveAction(null);
  };

  const actionButtons = [
    { id: "send", icon: Send, label: "Send" },
    { id: "edit", icon: Edit, label: "Edit" },
    { id: "split", icon: Split, label: "Split" },
    { id: "more", icon: MoreHorizontal, label: "More" },
  ];

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden">
      {/* Background overlay when menu is open */}
      {menuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Main content container */}
      <div 
        className="relative z-10 min-h-screen transition-transform duration-300 ease-in-out"
        style={{
          transform: menuOpen ? 'translateX(-70%)' : 'translateX(0)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6">
          <div className="flex-1" />
          <h1 className="text-2xl font-bold text-center">tapt</h1>
          <div className="flex-1 flex justify-end">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-gray-900 rounded-lg p-1">
            {["QR", "NFC"].map((mode) => (
              <button
                key={mode}
                onClick={() => setActiveMode(mode as "QR" | "NFC")}
                className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                  activeMode === mode
                    ? "bg-black text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Amount Box */}
        <div className="px-6 mb-6">
          <div 
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: '#00FF66' }}
          >
            <div className="text-black text-lg font-medium mb-2">Total</div>
            <div className="text-black text-4xl font-bold">${amount}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4 mb-6 px-6">
          {actionButtons.map((button) => (
            <button
              key={button.id}
              onClick={() => handleActionClick(button.id)}
              className={`flex flex-col items-center p-4 rounded-full transition-all duration-200 ${
                activeAction === button.id
                  ? 'bg-green-500 text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              style={{
                backgroundColor: activeAction === button.id ? '#00FF66' : undefined
              }}
            >
              <button.icon size={24} />
              <span className="text-xs mt-1 font-medium">{button.label}</span>
            </button>
          ))}
        </div>

        {/* Action Panel */}
        <div className="px-6">
          <div 
            className="overflow-hidden transition-all duration-250 ease-in-out"
            style={{
              maxHeight: activeAction ? '300px' : '0px',
            }}
          >
            <div className="bg-gray-800 rounded-2xl p-6 mb-6">
              {activeAction === "edit" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Name</label>
                    <Input
                      value={editData.name}
                      onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                      className="bg-gray-700 border-gray-600 text-white rounded-lg"
                      placeholder="Enter name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Item</label>
                    <Input
                      value={editData.item}
                      onChange={(e) => setEditData(prev => ({ ...prev, item: e.target.value }))}
                      className="bg-gray-700 border-gray-600 text-white rounded-lg"
                      placeholder="Enter item"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Price</label>
                    <Input
                      value={editData.price}
                      onChange={(e) => setEditData(prev => ({ ...prev, price: e.target.value }))}
                      className="bg-gray-700 border-gray-600 text-white rounded-lg"
                      placeholder="Enter price"
                    />
                  </div>
                  <Button
                    onClick={handleEditSubmit}
                    className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg"
                    style={{ backgroundColor: '#00FF66' }}
                  >
                    Enter
                  </Button>
                </div>
              )}

              {activeAction === "split" && (
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">Split the Bill</h3>
                  <p className="text-gray-300 mb-4">How many ways would you like to split this payment?</p>
                  <div className="flex justify-center gap-3 mb-4">
                    {[2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        onClick={() => onSplitBill?.(num)}
                        className="w-12 h-12 rounded-full bg-gray-700 hover:bg-green-500 text-white font-semibold transition-colors"
                        style={{
                          backgroundColor: '#00FF66',
                          color: 'black'
                        }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeAction === "send" && (
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">Send Payment Link</h3>
                  <p className="text-gray-300 mb-4">Share this payment with others</p>
                  <Button
                    className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold rounded-lg"
                    style={{ backgroundColor: '#00FF66' }}
                  >
                    Copy Link
                  </Button>
                </div>
              )}

              {activeAction === "more" && (
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-4 text-white">More Options</h3>
                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      Save for Later
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                    >
                      Export Receipt
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="px-6">
          <div className="bg-white rounded-2xl p-8 flex items-center justify-center">
            {activeMode === "QR" ? (
              <div className="text-center">
                <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4">
                  <QrCode size={64} className="text-gray-400" />
                </div>
                <p className="text-gray-600 text-sm">Scan to pay with any device</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-4">
                  <Smartphone size={64} className="text-gray-400" />
                </div>
                <p className="text-gray-600 text-sm">Tap your phone to pay</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slide-out Menu */}
      <div 
        className="menu-container fixed top-0 right-0 h-full bg-gray-900 z-50 transition-transform duration-300 ease-in-out"
        style={{
          width: '70%',
          transform: menuOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-white">Menu</h2>
            <button
              onClick={() => setMenuOpen(false)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X size={24} className="text-white" />
            </button>
          </div>
          
          <nav className="space-y-4">
            <a href="#" className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
              Payment History
            </a>
            <a href="#" className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
              Settings
            </a>
            <a href="#" className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
              Help & Support
            </a>
            <a href="#" className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
              About
            </a>
          </nav>
        </div>
      </div>
    </div>
  );
}
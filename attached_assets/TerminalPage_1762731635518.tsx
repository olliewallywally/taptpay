import { useState, useEffect } from 'react';
import { Home, Package, BarChart3, SlidersHorizontal, QrCode, Grid2x2, ChevronDown, CheckCircle2, Loader2, Check, X } from 'lucide-react';
import terminalIcon from 'figma:asset/334c2b7e95367d5970568548bd4fac0acb30be47.png';
import nfcIcon from 'figma:asset/334c2b7e95367d5970568548bd4fac0acb30be47.png';
import plusIcon from 'figma:asset/3fcfefb34c949493b14892f0072d8d060fbc36b4.png';
import arrowsIcon from 'figma:asset/c7a4059c8c8de52e2021b1a1ee599bf3aa6a00a3.png';
import { Input } from './ui/input';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface TerminalPageProps {
  user: any;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export function TerminalPage({ user, onNavigate, onLogout }: TerminalPageProps) {
  const [paymentStatus, setPaymentStatus] = useState<'ready' | 'processing' | 'accepted' | 'failed' | 'declined'>('ready');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');

  // Poll for payment status updates
  useEffect(() => {
    const pollPaymentStatus = async () => {
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-a4cbc891/payment-status`,
          {
            headers: {
              Authorization: `Bearer ${publicAnonKey}`,
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          setPaymentStatus(data.status || 'ready');
        }
      } catch (error) {
        console.error('Error polling payment status:', error);
      }
    };

    // Initial poll
    pollPaymentStatus();

    // Poll every 1 second
    const interval = setInterval(pollPaymentStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleAddClick = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleCreatePayment = () => {
    console.log('Create payment:', { itemName, quantity, price, description });
    setIsDropdownOpen(false);
    // Reset form
    setItemName('');
    setQuantity('');
    setPrice('');
    setDescription('');
  };

  const handleCancelPayment = () => {
    setIsDropdownOpen(false);
    // Reset form
    setItemName('');
    setQuantity('');
    setPrice('');
    setDescription('');
  };

  // Get button text based on payment status
  const getPaymentButtonText = () => {
    switch (paymentStatus) {
      case 'processing':
        return 'processing payment';
      case 'accepted':
        return 'payment accepted';
      case 'failed':
        return 'payment failed';
      case 'declined':
        return 'payment declined';
      default:
        return 'ready';
    }
  };

  // Get icon based on payment status
  const getPaymentIcon = () => {
    switch (paymentStatus) {
      case 'processing':
        return <Loader2 size={28} className="animate-spin" />;
      case 'accepted':
        return <Check size={28} />;
      case 'failed':
      case 'declined':
        return <X size={28} />;
      default:
        return <CheckCircle2 size={28} />;
    }
  };

  // Get button color based on payment status
  const getPaymentButtonColor = () => {
    switch (paymentStatus) {
      case 'accepted':
        return 'bg-green-400 text-white';
      case 'failed':
      case 'declined':
        return 'bg-red-400 text-white';
      default:
        return 'bg-[#00E5CC] text-[#0055FF]';
    }
  };

  return (
    <div className="min-h-screen bg-[#0055FF] pb-24 px-6 md:px-10">
      <div className="max-w-md md:max-w-2xl mx-auto pt-8 md:pt-12">
        {/* NFC Toggle */}
        <div className="flex justify-center mb-12 md:mb-16">
          <div className="bg-[#00E5CC] rounded-full px-6 md:px-8 py-3 md:py-4 flex items-center gap-3 md:gap-4">
            <span className="text-[#0055FF]">nfc</span>
            <div className="bg-white rounded-lg md:rounded-xl p-2 md:p-3">
              <img src={nfcIcon} alt="NFC" className="w-5 h-5 md:w-6 md:h-6" />
            </div>
          </div>
        </div>

        {/* Payment Card */}
        <div className="bg-[#00E5CC] rounded-[48px] md:rounded-[60px] mb-8 md:mb-12 overflow-visible">
          {/* Amount Display */}
          <div className="px-12 md:px-16 py-16 md:py-24 flex items-center justify-center">
            <div className="text-[#0055FF] text-7xl md:text-8xl font-bold">$8.99</div>
          </div>
          
          {/* Action Buttons Section */}
          <div className={`bg-[#E8E5E0] rounded-t-[48px] md:rounded-t-[60px] px-8 md:px-12 pt-8 md:pt-12 pb-6 md:pb-10 relative transition-all duration-500 ${
            !isDropdownOpen ? 'rounded-b-[48px] md:rounded-b-[60px]' : ''
          }`}>
            <div className="flex items-center justify-between gap-4 md:gap-6 relative z-20">
              <button 
                onClick={handleAddClick}
                className="w-16 h-16 md:w-20 md:h-20 bg-[#0055FF] rounded-full flex items-center justify-center hover:opacity-90 transition-opacity relative z-30"
              >
                <img src={plusIcon} alt="Add" className="w-7 h-7 md:w-9 md:h-9 brightness-0 invert" />
              </button>
              <button className="w-16 h-16 md:w-20 md:h-20 bg-[#0055FF] rounded-full flex items-center justify-center hover:opacity-90 transition-opacity">
                <img src={arrowsIcon} alt="Arrows" className="w-7 h-7 md:w-9 md:h-9 brightness-0 invert" />
              </button>
              <button className="w-16 h-16 md:w-20 md:h-20 bg-[#0055FF] rounded-full flex items-center justify-center hover:opacity-90 transition-opacity">
                <QrCode className="text-white" size={28} />
              </button>
              <button className="w-16 h-16 md:w-20 md:h-20 bg-[#0055FF] rounded-full flex items-center justify-center hover:opacity-90 transition-opacity">
                <Grid2x2 className="text-white" size={28} />
              </button>
            </div>

            {/* Dropdown Form */}
            <div 
              className="transition-all duration-500 ease-in-out"
              style={{
                maxHeight: isDropdownOpen ? '600px' : '0px',
                opacity: isDropdownOpen ? 1 : 0,
              }}
            >
              <div className="bg-white rounded-[32px] mt-4 px-6 md:px-8 pt-12 pb-6 md:pb-8 shadow-lg relative overflow-hidden">
                <div className="space-y-3 md:space-y-4">
                  <Input
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="item name"
                    className="w-full bg-[#0055FF] text-white placeholder:text-white/70 border-0 rounded-full h-12 md:h-14 px-6 md:px-8"
                  />
                  <Input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="quantity"
                    type="number"
                    className="w-full bg-[#0055FF] text-white placeholder:text-white/70 border-0 rounded-full h-12 md:h-14 px-6 md:px-8"
                  />
                  <Input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="price"
                    type="number"
                    className="w-full bg-[#0055FF] text-white placeholder:text-white/70 border-0 rounded-full h-12 md:h-14 px-6 md:px-8"
                  />
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="description"
                    className="w-full bg-[#0055FF] text-white placeholder:text-white/70 border-0 rounded-full h-12 md:h-14 px-6 md:px-8"
                  />
                  <div className="flex gap-3 md:gap-4 pt-2 md:pt-4">
                    <button
                      onClick={handleCancelPayment}
                      className="flex-1 bg-[#E8E5E0] text-[#0055FF] rounded-full py-3 md:py-4 hover:opacity-90 transition-opacity text-center text-sm"
                    >
                      cancel payment
                    </button>
                    <button
                      onClick={handleCreatePayment}
                      className="flex-1 bg-[#00E5CC] text-[#0055FF] rounded-full py-3 md:py-4 hover:opacity-90 transition-opacity text-center text-sm"
                    >
                      create
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Processing Payment Button */}
        <button className={`w-full rounded-full py-6 mb-4 flex items-center justify-center gap-3 hover:opacity-90 transition-all duration-300 ${getPaymentButtonColor()}`}>
          <span className="text-xl">{getPaymentButtonText()}</span>
          {getPaymentIcon()}
        </button>

        {/* Payment Stones Button */}
        <button className="w-full bg-[#00E5CC] text-[#0055FF] rounded-full py-6 mb-4 flex items-center justify-center gap-3 hover:opacity-90 transition-opacity">
          <span className="text-xl">payment stones</span>
          <ChevronDown size={28} />
        </button>

        {/* Cancel Payment Button */}
        <button className="w-full bg-[#E8E5E0] text-[#0055FF] rounded-full py-6 flex items-center justify-center hover:opacity-90 transition-opacity">
          <span className="text-xl">cancel payment</span>
        </button>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2C2C2E] rounded-t-[32px] px-8 py-6 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button 
            onClick={() => onNavigate('dashboard')}
            className="flex items-center justify-center w-12 h-12 hover:bg-gray-700 rounded-2xl transition-colors"
          >
            <Home className="text-white" size={24} />
          </button>
          <button 
            onClick={() => onNavigate('stock')}
            className="flex items-center justify-center w-12 h-12 hover:bg-gray-700 rounded-2xl transition-colors"
          >
            <Package className="text-white" size={24} />
          </button>
          <button className="flex items-center justify-center w-12 h-12 bg-[#0055FF] rounded-2xl">
            <img src={terminalIcon} alt="Terminal" className="w-6 h-6 invert" />
          </button>
          <button 
            onClick={() => onNavigate('analytics')}
            className="flex items-center justify-center w-12 h-12 hover:bg-gray-700 rounded-2xl transition-colors"
          >
            <BarChart3 className="text-white" size={24} />
          </button>
          <button 
            onClick={() => onNavigate('settings')}
            className="flex items-center justify-center w-12 h-12 hover:bg-gray-700 rounded-2xl transition-colors"
          >
            <SlidersHorizontal className="text-white" size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

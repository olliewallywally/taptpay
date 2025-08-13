import { useQuery } from "@tanstack/react-query";
import { MobileHeader } from "@/components/mobile-header";
import { useState, useEffect } from "react";

export default function SettingsSimple() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Get current user
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const merchantId = (user as any)?.user?.merchantId;

  // Get merchant data
  const { data: merchant, isLoading: merchantLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      if (!merchantId) throw new Error("No merchant ID available");
      const response = await fetch(`/api/merchants/${merchantId}`);
      if (!response.ok) throw new Error("Failed to fetch merchant");
      return response.json();
    },
    enabled: !!merchantId,
  });

  return (
    <div className="min-h-screen bg-gray-900">
      {isMobile && <MobileHeader title="Settings">Settings</MobileHeader>}
      
      <div className="max-w-4xl mx-auto px-4 py-8" style={{ paddingTop: isMobile ? '100px' : '40px' }}>
        <h1 className="text-3xl font-bold text-white mb-8">Settings</h1>
        
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl text-white mb-4">Debug Info</h2>
          <p className="text-gray-300">User Loading: {userLoading ? 'Yes' : 'No'}</p>
          <p className="text-gray-300">User: {user ? 'Loaded' : 'Not loaded'}</p>
          <p className="text-gray-300">Merchant ID: {merchantId || 'None'}</p>
          <p className="text-gray-300">Merchant Loading: {merchantLoading ? 'Yes' : 'No'}</p>
          <p className="text-gray-300">Merchant: {merchant ? 'Loaded' : 'Not loaded'}</p>
        </div>

        {merchant && (
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl text-white mb-4">Business Details</h2>
            <div className="text-gray-300">
              <p>Business Name: {merchant.businessName}</p>
              <p>Email: {merchant.email}</p>
              <p>Phone: {merchant.phone}</p>
              <p>Address: {merchant.address}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
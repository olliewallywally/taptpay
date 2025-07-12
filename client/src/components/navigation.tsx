import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { QrCode, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCurrentMerchantId } from "@/lib/auth";

export function Navigation() {
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setLocation("/");
  };

  const isActive = (path: string) => location === path;
  
  // Get current merchant ID for dynamic customer view link
  const merchantId = getCurrentMerchantId();
  const customerViewPath = merchantId ? `/pay/${merchantId}` : "/pay/1";

  const navigationLinks = [
    { path: "/merchant", label: "Terminal" },
    { path: "/dashboard", label: "Dashboard" },
    { path: "/nfc", label: "NFC Pay" },
    { path: "/settings", label: "Settings" },
    { path: customerViewPath, label: "Customer View" },
  ];

  return (
    <div className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-green-800 rounded flex items-center justify-center flex-shrink-0">
              <QrCode className="text-white w-4 h-4" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-gray-900">Tapt Payment Terminal</h1>
              {user && (
                <p className="text-sm text-gray-600">Welcome back, {user.email}</p>
              )}
            </div>
            <div className="sm:hidden">
              <h1 className="text-lg font-bold text-gray-900">Tapt</h1>
            </div>
          </div>

          {/* Desktop Navigation */}
          {!isMobile && (
            <div className="flex items-center space-x-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                {navigationLinks.map((link) => (
                  <a 
                    key={link.path}
                    href={link.path}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      isActive(link.path) 
                        ? "bg-white text-green-800 shadow-sm" 
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="text-gray-600 hover:text-gray-900"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          )}

          {/* Mobile Menu Button and Logout */}
          {isMobile && (
            <div className="flex items-center space-x-2">
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 px-3"
              >
                <LogOut className="w-4 h-4" />
                <span className="ml-1 text-xs">Exit</span>
              </Button>
              <Button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                variant="outline"
                size="sm"
                className="text-gray-600 hover:text-gray-900 p-2"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          )}
        </div>

        {/* Mobile Navigation Menu */}
        {isMobile && mobileMenuOpen && (
          <div className="mt-3 pb-3 border-t border-gray-200">
            <div className="flex flex-col space-y-1 pt-3">
              {user && (
                <div className="px-3 py-2 text-sm text-gray-600 border-b border-gray-100 mb-2">
                  {user.email}
                </div>
              )}
              {navigationLinks.map((link) => (
                <a
                  key={link.path}
                  href={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-3 text-base font-medium rounded-lg transition-all ${
                    isActive(link.path)
                      ? "bg-green-50 text-green-800 border-l-4 border-green-800"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
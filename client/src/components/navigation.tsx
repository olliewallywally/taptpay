import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { QrCode, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCurrentMerchantId } from "@/lib/auth";

export function Navigation() {
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMenuAnimating, setIsMenuAnimating] = useState(false);
  const isMobile = useIsMobile();
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setLocation("/");
  };

  const handleMenuToggle = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (mobileMenuOpen) {
      // Start closing animation
      setIsMenuAnimating(true);
      timeoutRef.current = setTimeout(() => {
        setMobileMenuOpen(false);
        setIsMenuAnimating(false);
      }, 250); // Match the exit animation duration
    } else {
      // Open menu immediately and start enter animation
      setMobileMenuOpen(true);
      setIsMenuAnimating(true);
      timeoutRef.current = setTimeout(() => {
        setIsMenuAnimating(false);
      }, 300); // Match the enter animation duration
    }
  };

  const isActive = (path: string) => location === path;
  
  // Get current merchant ID for dynamic customer view link
  const merchantId = getCurrentMerchantId();
  const customerViewPath = merchantId ? `/pay/${merchantId}` : "/pay/1";

  const navigationLinks = [
    { path: "/merchant", label: "Terminal" },
    { path: "/dashboard", label: "Dashboard" },
    { path: "/transactions", label: "Transactions" },
    { path: "/nfc", label: "NFC Pay" },
    { path: "/settings", label: "Settings" },
    { path: customerViewPath, label: "Customer View" },
  ];

  return (
    <div className="absolute top-0 left-0 right-0 z-20 p-4">
      {/* Glass Morphism Navigation Bubble */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-white/10 backdrop-blur-sm rounded-lg flex items-center justify-center flex-shrink-0 border border-white/20">
                <QrCode className="text-black w-6 h-6" />
              </div>
              <div className="hidden sm:block">
                <span className="text-white font-black text-xl tracking-wider lowercase" style={{ fontFamily: 'Nunito, system-ui, sans-serif' }}>
                  tapt
                </span>
                <span className="text-white text-sm ml-2 font-light">Payment Terminal</span>
                {user && (
                  <p className="text-sm text-white/70 minimal-text mt-1">Welcome back, {user.email}</p>
                )}
              </div>
              <div className="sm:hidden">
                <span className="text-white font-black text-lg tracking-wider lowercase" style={{ fontFamily: 'Nunito, system-ui, sans-serif' }}>
                  tapt
                </span>
              </div>
            </div>

            {/* Desktop Navigation */}
            {!isMobile && (
              <div className="flex items-center space-x-4">
                <div className="flex space-x-2">
                  {navigationLinks.slice(0, 3).map((link) => (
                    <a 
                      key={link.path}
                      href={link.path}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all backdrop-blur-sm border ${
                        isActive(link.path) 
                          ? "bg-white/20 text-black shadow-sm border-white/30" 
                          : "bg-white/10 text-black hover:text-black hover:bg-white/15 border-white/20"
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
                  className="text-black border-white/20 hover:bg-white/15 hover:text-black backdrop-blur-sm bg-white/10"
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
                  className="text-black border-white/20 hover:bg-white/15 hover:text-black backdrop-blur-sm bg-white/10 px-3"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="ml-1 text-xs">Exit</span>
                </Button>
                <Button
                  onClick={handleMenuToggle}
                  variant="outline"
                  size="sm"
                  className="text-black border-white/20 hover:bg-white/15 hover:text-black backdrop-blur-sm bg-white/10 p-2"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobile && mobileMenuOpen && (
        <div 
          className={`mt-4 mobile-menu-container ${
            isMenuAnimating 
              ? mobileMenuOpen && !isMenuAnimating 
                ? 'mobile-menu-enter' 
                : 'mobile-menu-exit'
              : 'mobile-menu-enter'
          }`}
        >
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl">
            <div className="max-w-6xl mx-auto px-6 py-4">
              <div className="flex flex-col space-y-1">
                {user && (
                  <div className="px-3 py-2 text-sm text-white/70 border-b border-white/20 mb-2">
                    {user.email}
                  </div>
                )}
                {navigationLinks.map((link, index) => (
                  <a
                    key={link.path}
                    href={link.path}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setIsMenuAnimating(false);
                    }}
                    className={`px-3 py-3 text-base font-medium rounded-lg transition-all mx-2 transform ${
                      isActive(link.path)
                        ? "bg-white/20 text-white border-l-4 border-white/50 backdrop-blur-sm"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                    style={{
                      animationDelay: `${index * 50}ms`
                    }}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCurrentMerchantId } from "@/lib/auth";
import taptLogoUrl from "@assets/tapt logo_1751676012286.png";

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

  const handleMenuToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const isActive = (path: string) => location === path;
  
  // Get current merchant ID for dynamic customer view link
  const merchantId = getCurrentMerchantId();
  const customerViewPath = merchantId ? `/pay/${merchantId}` : "/pay/1";

  // Primary navigation for main functionality
  const primaryLinks = [
    { path: "/merchant", label: "Terminal" },
    { path: "/dashboard", label: "Dashboard" },
  ];

  // Secondary navigation for management (moved to "More" dropdown)
  const secondaryLinks = [
    { path: "/stock", label: "Stock" },
    { path: "/transactions", label: "Transactions" },
    { path: "/settings", label: "Settings" },
    { path: customerViewPath, label: "Customer View" },
  ];

  const allNavigationLinks = [...primaryLinks, ...secondaryLinks];

  return (
    <div className="absolute top-0 left-0 right-0 z-20">
      <div className="container mx-auto px-4 pt-4">
        {/* Glass Morphism Navigation Bubble */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl">
          <div className="px-3 py-2 sm:px-6 sm:py-4">
            <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center">
                <img 
                  src={taptLogoUrl} 
                  alt="Tapt Logo" 
                  className="h-8 sm:h-10 w-auto filter brightness-0 invert"
                />
                {user && (
                  <div className="ml-2 sm:ml-4 hidden sm:block">
                    <p className="text-xs text-white/60">Welcome back, {user.email}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop Navigation */}
            {!isMobile && (
              <div className="flex items-center space-x-3">
                {/* Primary Navigation */}
                <div className="flex space-x-3">
                  {primaryLinks.map((link) => (
                    <a 
                      key={link.path}
                      href={link.path}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all backdrop-blur-sm border min-w-[90px] text-center ${
                        isActive(link.path) 
                          ? "bg-white/25 text-black shadow-lg border-white/40" 
                          : "bg-white/10 text-black hover:text-black hover:bg-white/20 border-white/20"
                      }`}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>

                {/* Secondary Navigation Dropdown */}
                <div className="relative group">
                  <button className="px-4 py-2 text-sm font-medium rounded-lg transition-all backdrop-blur-sm border bg-white/10 text-black hover:bg-white/20 border-white/20 flex items-center justify-center min-w-[90px]">
                    More
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {/* Dropdown Menu */}
                  <div className="absolute right-0 mt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <div className="backdrop-blur-2xl bg-black/40 border border-white/30 rounded-lg shadow-2xl overflow-hidden">
                      {secondaryLinks.map((link) => (
                        <a
                          key={link.path}
                          href={link.path}
                          className={`block px-4 py-3 text-sm transition-all ${
                            isActive(link.path)
                              ? "bg-white/40 text-white font-medium border-l-4 border-white/80"
                              : "text-white hover:bg-white/20 hover:text-white"
                          }`}
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-all backdrop-blur-sm border bg-white/10 text-black hover:bg-white/20 hover:text-black border-white/20 min-w-[90px] flex items-center justify-center"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mobile Menu Button and Logout */}
            {isMobile && (
              <div className="flex items-center space-x-2">
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="text-white border-white/20 hover:bg-white/15 hover:text-white backdrop-blur-sm bg-white/10 px-3"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="ml-1 text-xs">Exit</span>
                </Button>
                <Button
                  onClick={handleMenuToggle}
                  variant="outline"
                  size="sm"
                  className="text-white border-white/20 hover:bg-white/15 hover:text-white backdrop-blur-sm bg-white/10 p-2"
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
          <div className="mt-4 mobile-menu-enter">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl">
              <div className="px-6 py-4">
                <div className="flex flex-col space-y-1">
                  {user && (
                    <div className="px-3 py-2 text-sm text-white/70 border-b border-white/20 mb-2">
                      {user.email}
                    </div>
                  )}
                  {allNavigationLinks.map((link, index) => (
                    <a
                      key={link.path}
                      href={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`px-3 py-3 text-base font-medium rounded-lg transition-all mx-2 ${
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
    </div>
  );
}
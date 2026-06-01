import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { LogOut, Menu, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCurrentMerchantId } from "@/lib/auth";
import taptLogoUrl from "@assets/tapt logo_1751676012286.png";

export function Navigation() {
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try { setUser(JSON.parse(userData)); } catch {}
    }
  }, []);

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    localStorage.removeItem("merchantId");
    setLocation("/");
  };

  const navigate = (path: string) => {
    setMobileMenuOpen(false);
    setDropdownOpen(false);
    setLocation(path);
  };

  const isActive = (path: string) => location === path;

  const merchantId = getCurrentMerchantId();
  const customerViewPath = merchantId ? `/pay/${merchantId}` : "/pay/1";

  const primaryLinks = [
    { path: "/terminal", label: "Terminal" },
    { path: "/dashboard", label: "Dashboard" },
  ];

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
        <div className="backdrop-blur-xl bg-black/20 border border-white/30 rounded-2xl shadow-2xl">
          <div className="px-3 py-2 sm:px-6 sm:py-4">
            <div className="flex items-center justify-between">
              {/* Logo */}
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
                      <button
                        key={link.path}
                        onClick={() => navigate(link.path)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all backdrop-blur-sm border min-w-[90px] text-center ${
                          isActive(link.path)
                            ? "bg-white/90 text-black shadow-lg border-white/60"
                            : "bg-white/20 text-white hover:text-black hover:bg-white/70 border-white/30"
                        }`}
                      >
                        {link.label}
                      </button>
                    ))}
                  </div>

                  {/* Secondary Navigation Dropdown — keyboard and touch accessible */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setDropdownOpen((o) => !o)}
                      aria-haspopup="true"
                      aria-expanded={dropdownOpen}
                      className="px-4 py-2 text-sm font-medium rounded-lg transition-all backdrop-blur-sm border bg-white/20 text-white hover:bg-white/70 hover:text-black border-white/30 flex items-center justify-center min-w-[90px]"
                    >
                      More
                      <ChevronDown
                        className="w-4 h-4 ml-1"
                        style={{
                          transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s ease",
                        }}
                      />
                    </button>

                    {dropdownOpen && (
                      <div className="absolute right-0 mt-2 w-48 z-50">
                        <div className="backdrop-blur-2xl bg-black/40 border border-white/30 rounded-lg shadow-2xl overflow-hidden">
                          {secondaryLinks.map((link) => (
                            <button
                              key={link.path}
                              onClick={() => navigate(link.path)}
                              className={`block w-full text-left px-4 py-3 text-sm transition-all ${
                                isActive(link.path)
                                  ? "bg-white/40 text-white font-medium border-l-4 border-white/80"
                                  : "text-white hover:bg-white/20"
                              }`}
                            >
                              {link.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Logout Button */}
                  <button
                    onClick={handleLogout}
                    aria-label="Log out"
                    className="px-4 py-2 text-sm font-medium rounded-lg transition-all backdrop-blur-sm border bg-white/20 text-white hover:bg-white/70 hover:text-black border-white/30 min-w-[90px] flex items-center justify-center"
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
                    aria-label="Log out"
                    className="text-white border-white/20 hover:bg-white/15 hover:text-white backdrop-blur-sm bg-white/10 px-3"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="ml-1 text-xs">Exit</span>
                  </Button>
                  <Button
                    onClick={() => setMobileMenuOpen((o) => !o)}
                    variant="outline"
                    size="sm"
                    aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                    aria-expanded={mobileMenuOpen}
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
                    <button
                      key={link.path}
                      onClick={() => navigate(link.path)}
                      className={`w-full text-left px-3 py-3 text-base font-medium rounded-lg transition-all mx-2 ${
                        isActive(link.path)
                          ? "bg-white/20 text-white border-l-4 border-white/50 backdrop-blur-sm"
                          : "text-white/80 hover:bg-white/10 hover:text-white"
                      }`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {link.label}
                    </button>
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

import { useState } from "react";
import { Menu, X, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import taptLogoPath from "@assets/IMG_6592_1755070818452.png";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900">
      {/* Menu Icon - Right Corner (stays fixed) */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="fixed top-6 right-6 z-50 p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
      >
        {menuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Slide-over Menu */}
      <div className={`fixed top-0 right-0 h-full w-80 bg-gray-900 border-l border-white/20 shadow-xl transform transition-transform duration-300 z-40 ${
        menuOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="p-6 pt-20">
          <nav className="space-y-4">
            <Link href="/merchant" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Terminal
            </Link>
            <Link href="/crypto-terminal" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-orange-400 rounded-xl hover:bg-orange-950/30 transition-colors font-medium">
              Crypto Terminal
            </Link>
            <Link href="/demo-terminal" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-green-400 rounded-xl hover:bg-green-950/30 transition-colors font-medium">
              Demo Terminal
            </Link>
            <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Dashboard
            </Link>
            <Link href="/transactions" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Transactions
            </Link>
            <Link href="/stock" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Stock
            </Link>
            <Link href="/settings" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-white rounded-xl hover:bg-white/10 transition-colors font-medium">
              Settings
            </Link>
            <div className="pt-4 mt-4 border-t border-white/20">
              <button 
                onClick={handleLogout}
                className="flex items-center w-full text-left py-3 px-4 text-red-400 hover:bg-red-950/30 rounded-xl transition-colors font-medium"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Content with slide-over effect */}
      <div className={`relative transition-transform duration-300 ${menuOpen ? '-translate-x-80' : 'translate-x-0'}`}>
        {/* Logo - moves with content */}
        <div className="absolute top-6 left-6 z-30">
          <img 
            src={taptLogoPath} 
            alt="Tapt Logo" 
            className="h-8 w-auto filter brightness-0 invert"
          />
        </div>
        
        {/* Content with proper top spacing */}
        <div className="pt-20">
          {children}
        </div>
      </div>
    </div>
  );
}
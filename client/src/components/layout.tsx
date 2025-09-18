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
    <div className="min-h-screen bg-[hsl(210,20%,98%)]">
      {/* Simple Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Logo */}
          <div className="flex items-center">
            <img 
              src={taptLogoPath} 
              alt="Tapt Logo" 
              className="h-8 w-auto"
            />
          </div>
          
          {/* Hamburger Menu */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black bg-opacity-50" onClick={() => setMenuOpen(false)}>
          <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-xl transform transition-transform duration-300">
            <div className="p-6 pt-20">
              <nav className="space-y-4">
                <Link href="/merchant" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-gray-800 rounded-xl hover:bg-gray-100 transition-colors font-medium">
                  Terminal
                </Link>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-gray-800 rounded-xl hover:bg-gray-100 transition-colors font-medium">
                  Dashboard
                </Link>
                <Link href="/transactions" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-gray-800 rounded-xl hover:bg-gray-100 transition-colors font-medium">
                  Transactions
                </Link>
                <Link href="/stock" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-gray-800 rounded-xl hover:bg-gray-100 transition-colors font-medium">
                  Stock
                </Link>
                <Link href="/settings" onClick={() => setMenuOpen(false)} className="block py-3 px-4 text-gray-800 rounded-xl hover:bg-gray-100 transition-colors font-medium">
                  Settings
                </Link>
                <div className="pt-4 mt-4 border-t border-gray-200">
                  <button 
                    onClick={handleLogout}
                    className="flex items-center w-full text-left py-3 px-4 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-medium"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </button>
                </div>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Content with proper top spacing */}
      <div className="pt-16">
        {children}
      </div>
    </div>
  );
}
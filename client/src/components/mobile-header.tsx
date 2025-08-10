import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "wouter";

interface MobileHeaderProps {
  title: string;
  showMenu?: boolean;
}

export function MobileHeader({ title, showMenu = true }: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

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

  return (
    <>
      {/* Menu overlay */}
      {menuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-6 relative z-10">
        <div className="flex-1" />
        <h1 className="text-2xl font-bold text-center text-white">{title}</h1>
        <div className="flex-1 flex justify-end">
          {showMenu && (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
          )}
        </div>
      </div>

      {/* Slide-out Hamburger Menu */}
      {showMenu && (
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
              <Link href="/merchant" className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
                Terminal
              </Link>
              <Link href="/dashboard" className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
                Dashboard
              </Link>
              <Link href="/transactions" className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
                Transaction History
              </Link>
              <Link href="/settings" className="block py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors">
                Settings
              </Link>
              <button 
                onClick={() => {
                  localStorage.removeItem('auth-token');
                  window.location.href = '/login';
                }}
                className="block w-full text-left py-3 px-4 text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                Logout
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
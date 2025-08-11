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
      <div 
        className={`fixed inset-0 bg-black transition-opacity duration-300 z-[1000] ${
          menuOpen ? 'bg-opacity-50 pointer-events-auto' : 'bg-opacity-0 pointer-events-none'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Floating Header */}
      <div className="fixed top-4 left-4 right-4 flex items-center justify-between z-[999] backdrop-blur-xl bg-black/20 border border-white/20 rounded-2xl p-4">
        <div className="flex-1" />
        <h1 className="text-xl font-bold text-center text-white">{title}</h1>
        <div className="flex-1 flex justify-end">
          {showMenu && (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Menu size={20} className="text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Slide-out Hamburger Menu */}
      <div 
        className="menu-container fixed top-0 right-0 h-full bg-black/95 backdrop-blur-xl border-l border-white/20 z-[1001] transition-transform duration-300 ease-in-out"
        style={{
          width: '70%',
          transform: menuOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-white">Navigation</h2>
            <button
              onClick={() => setMenuOpen(false)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
          </div>
          
          <nav className="space-y-2">
            <Link 
              href="/merchant" 
              onClick={() => setMenuOpen(false)} 
              className="block py-4 px-4 text-white hover:bg-white/10 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
            >
              🏪 Terminal
            </Link>
            <Link 
              href="/dashboard" 
              onClick={() => setMenuOpen(false)} 
              className="block py-4 px-4 text-white hover:bg-white/10 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
            >
              📊 Dashboard
            </Link>
            <Link 
              href="/transactions" 
              onClick={() => setMenuOpen(false)} 
              className="block py-4 px-4 text-white hover:bg-white/10 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
            >
              💳 Transactions
            </Link>
            <Link 
              href="/settings" 
              onClick={() => setMenuOpen(false)} 
              className="block py-4 px-4 text-white hover:bg-white/10 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
            >
              ⚙️ Settings
            </Link>
            <div className="pt-4 mt-4 border-t border-white/20">
              <button 
                onClick={() => {
                  localStorage.removeItem('auth-token');
                  window.location.href = '/login';
                }}
                className="block w-full text-left py-4 px-4 text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200 font-medium transform hover:scale-105"
              >
                🚪 Logout
              </button>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
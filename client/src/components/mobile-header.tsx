import { useState, useEffect, ReactNode } from "react";
import { Menu } from "lucide-react";
import { Link } from "wouter";

interface MobileHeaderProps {
  title: string;
  children: ReactNode;
  showMenu?: boolean;
}

export function MobileHeader({ title, children, showMenu = true }: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu when clicking on main content
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuOpen && (event.target as Element).closest('.main-content')) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <>
      {/* Background Menu */}
      <div className="fixed inset-0 bg-gray-300 z-[10]">
        <div className="p-6 pt-16">
          <nav className="space-y-1">
            <Link 
              href="/merchant" 
              onClick={() => setMenuOpen(false)} 
              className="block py-4 px-4 text-gray-800 hover:text-green-500 transition-colors duration-200 font-medium text-lg"
            >
              Terminal
            </Link>
            <Link 
              href="/dashboard" 
              onClick={() => setMenuOpen(false)} 
              className="block py-4 px-4 text-gray-800 hover:text-green-500 transition-colors duration-200 font-medium text-lg"
            >
              Dashboard
            </Link>
            <Link 
              href="/transactions" 
              onClick={() => setMenuOpen(false)} 
              className="block py-4 px-4 text-gray-800 hover:text-green-500 transition-colors duration-200 font-medium text-lg"
            >
              Transactions
            </Link>
            <Link 
              href="/settings" 
              onClick={() => setMenuOpen(false)} 
              className="block py-4 px-4 text-gray-800 hover:text-green-500 transition-colors duration-200 font-medium text-lg"
            >
              Settings
            </Link>
            <div className="pt-4 mt-4 border-t border-gray-400">
              <button 
                onClick={() => {
                  localStorage.removeItem('auth-token');
                  window.location.href = '/login';
                }}
                className="block w-full text-left py-4 px-4 text-red-600 hover:text-red-700 transition-colors duration-200 font-medium text-lg"
              >
                Logout
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Main Content that slides */}
      <div 
        className="main-content fixed inset-0 bg-black z-[20] transition-transform duration-300 ease-in-out overflow-hidden"
        style={{
          transform: menuOpen ? 'translateX(70%)' : 'translateX(0)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between backdrop-blur-xl bg-black/80 border-b border-white/20 p-4">
          <div className="flex-1 flex justify-start">
            {showMenu && (
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Menu size={20} className="text-white" />
              </button>
            )}
          </div>
          <h1 className="text-xl font-bold text-center text-white">{title}</h1>
          <div className="flex-1" />
        </div>
        
        {/* Content area that scrolls */}
        <div className="h-full overflow-y-auto" style={{ paddingTop: '0px' }}>
          {children}
        </div>
      </div>
    </>
  );
}
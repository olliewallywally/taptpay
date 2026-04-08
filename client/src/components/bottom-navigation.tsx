import { useLocation } from "wouter";
import { Home, Package, BarChart3, SlidersHorizontal, Terminal } from "lucide-react";

export function BottomNavigation() {
  const [location, setLocation] = useLocation();
  
  // Only show on specific pages
  const showNav = ['/dashboard', '/stock', '/transactions', '/settings', '/terminal'].includes(location);
  
  if (!showNav) return null;

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Home' },
    { path: '/stock', icon: Package, label: 'Stock' },
    { path: '/terminal', icon: Terminal, label: 'Terminal' },
    { path: '/transactions', icon: BarChart3, label: 'Analytics' },
    { path: '/settings', icon: SlidersHorizontal, label: 'Settings' },
  ];

  return (
    <div className="fixed bottom-4 sm:bottom-6 left-4 right-4 z-50 flex justify-center pointer-events-none">
      <div
        className="pointer-events-auto bg-[#2C2C2E] rounded-full px-5 sm:px-8 py-3 sm:py-4 shadow-2xl flex items-center gap-4 sm:gap-6 md:gap-8"
        style={{ minWidth: 'min(360px, 100%)', maxWidth: '480px' }}
      >
        {navItems.map(({ path, icon: Icon, label }) => (
          <button
            key={path}
            onClick={() => setLocation(path)}
            className={`flex flex-col items-center justify-center gap-1 transition-all flex-1 ${
              location === path
                ? 'text-[#00E5CC]'
                : 'text-white/60 hover:text-white/80'
            }`}
            data-testid={`nav-${label.toLowerCase()}`}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

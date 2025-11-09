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
    <div className="fixed bottom-0 left-0 right-0 bg-[#2C2C2E] rounded-t-[24px] sm:rounded-t-[32px] md:rounded-t-[40px] px-4 sm:px-8 md:px-12 py-4 sm:py-6 md:py-8 z-50">
      <div className="max-w-md md:max-w-2xl mx-auto flex items-center justify-between gap-2 md:gap-4">
        {navItems.map(({ path, icon: Icon, label }) => (
          <button
            key={path}
            onClick={() => setLocation(path)}
            className={`flex flex-col items-center justify-center gap-1 sm:gap-1.5 md:gap-2 transition-all flex-1 ${
              location === path
                ? 'text-[#00E5CC]'
                : 'text-white/60 hover:text-white/80'
            }`}
            data-testid={`nav-${label.toLowerCase()}`}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
            <span className="text-[10px] sm:text-xs md:text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

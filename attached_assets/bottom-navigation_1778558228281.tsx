import { useLocation } from "wouter";
import { Home, Package, BarChart3, SlidersHorizontal, Terminal, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { getCurrentMerchantId } from "@/lib/auth";

export function BottomNavigation() {
  const [location, setLocation] = useLocation();
  const merchantId = getCurrentMerchantId();

  const showNav = ['/dashboard', '/stock', '/transactions', '/settings', '/terminal', '/stack'].includes(location);

  const { data: allTransactions = [] } = useQuery({
    queryKey: ["/api/merchants", merchantId, "transactions"],
    queryFn: async () => {
      const r = await fetch(`/api/merchants/${merchantId}/transactions`);
      if (!r.ok) throw new Error();
      return r.json();
    },
    enabled: showNav && !!merchantId,
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const pendingCount = (allTransactions as any[]).filter(
    (tx: any) => tx.status === "pending" || tx.status === "processing"
  ).length;

  if (!showNav) return null;

  const navItems = [
    { path: '/dashboard',    icon: Home,             label: 'Home'     },
    { path: '/stock',        icon: Package,          label: 'Stock'    },
    { path: '/terminal',     icon: Terminal,         label: 'Terminal' },
    { path: '/stack',        icon: Layers,           label: 'Stack',   badge: pendingCount },
    { path: '/transactions', icon: BarChart3,        label: 'Analytics'},
    { path: '/settings',     icon: SlidersHorizontal,label: 'Settings' },
  ];

  return (
    <div className="fixed bottom-4 sm:bottom-6 left-4 right-4 z-50 flex justify-center pointer-events-none">
      <div
        className="pointer-events-auto rounded-full px-3 sm:px-5 py-3 flex items-center gap-1 sm:gap-2"
        style={{
          background: "#0C1535",
          minWidth: 'min(380px, 100%)',
          maxWidth: '520px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {navItems.map(({ path, icon: Icon, label, badge }) => {
          const active = location === path;
          return (
            <motion.button
              key={path}
              onClick={() => setLocation(path)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 relative py-1"
              whileTap={{ scale: 0.78 }}
              transition={{ type: "spring", stiffness: 650, damping: 28 }}
              data-testid={`nav-${label.toLowerCase()}`}
            >
              {active && (
                <motion.div
                  layoutId="nav-active-pill"
                  className="absolute inset-0 rounded-full"
                  style={{ background: "rgba(0,223,200,0.12)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}

              <div className="relative z-10">
                <motion.div
                  animate={{ color: active ? "#00DFC8" : "rgba(255,255,255,0.45)" }}
                  transition={{ duration: 0.15 }}
                >
                  <Icon className="w-5 h-5" />
                </motion.div>

                <AnimatePresence>
                  {badge != null && badge > 0 && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 550, damping: 22 }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-black text-[9px] font-bold flex items-center justify-center"
                      style={{ backgroundColor: '#00DFC8' }}
                    >
                      {badge > 9 ? '9+' : badge}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <motion.span
                className="text-[9px] sm:text-[10px] font-medium relative z-10"
                animate={{ color: active ? "#00DFC8" : "rgba(255,255,255,0.38)" }}
                transition={{ duration: 0.15 }}
              >
                {label}
              </motion.span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

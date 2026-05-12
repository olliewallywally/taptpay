import { useState, useEffect, useRef, createContext, useContext, useCallback, useMemo } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { X, WifiOff, AlertTriangle, CheckCircle, Info, Smartphone } from "lucide-react";
import { sseClient } from "@/lib/sse-client";

interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info" | "device";
  title: string;
  message: string;
  duration?: number;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
  }>;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => string | undefined;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within a NotificationProvider");
  return context;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const notificationIds = useRef<Set<string>>(new Set());

  const addNotification = useCallback((notification: Omit<Notification, "id">) => {
    const dedupeKey = `${notification.type}-${notification.title}-${notification.message}`;
    if (notification.duration === 0 && notificationIds.current.has(dedupeKey)) return;

    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    notificationIds.current.add(dedupeKey);
    setNotifications(prev => [...prev, { ...notification, id }]);

    if (notification.duration !== 0) {
      const timeout = notification.duration || 5000;
      const timeoutId = setTimeout(() => removeNotification(id), timeout);
      notificationTimeouts.current.set(id, timeoutId);
    }
    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const n = prev.find(n => n.id === id);
      if (n) notificationIds.current.delete(`${n.type}-${n.title}-${n.message}`);
      return prev.filter(n => n.id !== id);
    });
    const t = notificationTimeouts.current.get(id);
    if (t) { clearTimeout(t); notificationTimeouts.current.delete(id); }
  }, []);

  const clearAll = useCallback(() => {
    notificationTimeouts.current.forEach(clearTimeout);
    notificationTimeouts.current.clear();
    notificationIds.current.clear();
    setNotifications([]);
  }, []);

  const contextValue = useMemo(() => ({
    notifications, addNotification, removeNotification, clearAll,
  }), [notifications, addNotification, removeNotification, clearAll]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
}

const TYPE_CONFIG = {
  success: { icon: CheckCircle, color: "#00DFC8", label: "TaptPay" },
  error:   { icon: AlertTriangle, color: "#FF4D4D", label: "Alert"   },
  warning: { icon: AlertTriangle, color: "#F59E0B", label: "Warning" },
  info:    { icon: Info,          color: "#60A5FA", label: "Info"    },
  device:  { icon: Smartphone,   color: "#A78BFA", label: "Device"  },
} as const;

function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications();
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] flex flex-col items-center pointer-events-none"
      style={{ paddingTop: "max(env(safe-area-inset-top, 10px), 10px)" }}
    >
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            layout
            initial={{ opacity: 0, y: -70, scale: 0.86 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88, y: -16, transition: { duration: 0.16, ease: "easeIn" } }}
            transition={{ type: "spring", stiffness: 480, damping: 36 }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 20 }}
            dragElastic={{ top: 0.9, bottom: 0.05 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -24) removeNotification(notification.id);
            }}
            className="pointer-events-auto mb-2 w-full px-3"
            style={{ maxWidth: 440 }}
          >
            <NotificationCard
              notification={notification}
              onRemove={() => removeNotification(notification.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function NotificationCard({ notification, onRemove }: { notification: Notification; onRemove: () => void }) {
  const cfg = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.info;
  const Icon = cfg.icon;
  const duration = notification.duration ?? 5000;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (duration === 0) return;
    const start = Date.now();
    const tick = () => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / duration) * 100);
      setProgress(pct);
      if (pct > 0) requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  return (
    <div
      className="relative rounded-[18px] overflow-hidden"
      style={{
        background: "rgba(6,13,31,0.96)",
        backdropFilter: "blur(28px) saturate(1.8)",
        WebkitBackdropFilter: "blur(28px) saturate(1.8)",
        border: `1px solid rgba(255,255,255,0.09)`,
        boxShadow: `0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      {duration > 0 && (
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.06)" }}>
          <motion.div
            className="h-full rounded-full origin-left"
            style={{ backgroundColor: cfg.color }}
            animate={{ scaleX: progress / 100 }}
            transition={{ duration: 0.05, ease: "linear" }}
          />
        </div>
      )}

      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
        style={{ backgroundColor: cfg.color }} />

      <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.05 }}
          className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5"
          style={{ backgroundColor: `${cfg.color}1a`, border: `1px solid ${cfg.color}30` }}
        >
          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
        </motion.div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{ color: `${cfg.color}88` }}>
              {cfg.label}
            </span>
            <motion.button
              whileTap={{ scale: 0.8 }}
              onClick={onRemove}
              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <X className="w-3 h-3 text-white/40" />
            </motion.button>
          </div>
          <p className="text-white text-sm font-semibold leading-snug">{notification.title}</p>
          {notification.message && (
            <p className="text-white/45 text-xs mt-0.5 leading-relaxed">{notification.message}</p>
          )}
          {notification.actions && notification.actions.length > 0 && (
            <div className="flex gap-2 mt-2.5">
              {notification.actions.map((action, i) => (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.94 }}
                  onClick={action.onClick}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={action.variant === "primary"
                    ? { backgroundColor: cfg.color, color: "#000" }
                    : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                >
                  {action.label}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function useDeviceStatusMonitoring() {
  const { addNotification, removeNotification } = useNotifications();
  const offlineNotificationId = useRef<string | null>(null);
  const statusRefs = useRef({ onlineStatusNotified: false, visibilityNotified: false, isInitialized: false });

  const handleOnline = useCallback(() => {
    if (offlineNotificationId.current) {
      removeNotification(offlineNotificationId.current);
      offlineNotificationId.current = null;
    }
    if (statusRefs.current.onlineStatusNotified && statusRefs.current.isInitialized) {
      addNotification({ type: "success", title: "Connection Restored", message: "Your device is back online and payments can be processed.", duration: 4000 });
    }
    statusRefs.current.onlineStatusNotified = true;
    statusRefs.current.isInitialized = true;
  }, [addNotification, removeNotification]);

  const handleOffline = useCallback(() => {
    if (!offlineNotificationId.current) {
      const id = addNotification({
        type: "error", title: "Connection Lost",
        message: "No internet connection. Payments cannot be processed until connection is restored.",
        duration: 0,
        actions: [{ label: "Retry", onClick: () => window.location.reload(), variant: "primary" }],
      });
      offlineNotificationId.current = id || null;
    }
    statusRefs.current.onlineStatusNotified = true;
    statusRefs.current.isInitialized = true;
  }, [addNotification]);

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      if (!statusRefs.current.visibilityNotified) {
        addNotification({ type: "device", title: "Device Inactive", message: "Payment terminal may miss transactions when the app is not active.", duration: 6000 });
        statusRefs.current.visibilityNotified = true;
      }
    } else {
      statusRefs.current.visibilityNotified = false;
    }
  }, [addNotification]);

  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (window.navigator.onLine) {
      const message = "Closing the terminal will stop payment processing. Are you sure?";
      e.preventDefault();
      e.returnValue = message;
      return message;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    if (!navigator.onLine) handleOffline();
    else statusRefs.current.isInitialized = true;
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [handleOnline, handleOffline, handleVisibilityChange, handleBeforeUnload]);
}

export function useSSEConnectionMonitoring(merchantId: number) {
  const { addNotification, removeNotification } = useNotifications();
  const sseNotificationId = useRef<string | null>(null);
  const statusRefs = useRef({ connectionLostNotified: false, lastConnectionState: true, isInitialized: false });

  const checkSSEConnection = useCallback(() => {
    const sseConnected = navigator.onLine;
    if (sseConnected === statusRefs.current.lastConnectionState && statusRefs.current.isInitialized) return;

    if (!sseConnected && !statusRefs.current.connectionLostNotified) {
      if (sseNotificationId.current) removeNotification(sseNotificationId.current);
      const id = addNotification({
        type: "warning", title: "Real-time Updates Disconnected",
        message: "Payment status updates may be delayed. Reconnecting...",
        duration: 0,
        actions: [{ label: "Refresh", onClick: () => window.location.reload(), variant: "primary" }],
      });
      sseNotificationId.current = id || null;
      statusRefs.current.connectionLostNotified = true;
    } else if (sseConnected && statusRefs.current.connectionLostNotified) {
      if (sseNotificationId.current) { removeNotification(sseNotificationId.current); sseNotificationId.current = null; }
      addNotification({ type: "success", title: "Real-time Updates Restored", message: "Payment status updates are working normally.", duration: 3000 });
      statusRefs.current.connectionLostNotified = false;
    }

    statusRefs.current.lastConnectionState = sseConnected;
    statusRefs.current.isInitialized = true;
  }, [addNotification, removeNotification]);

  useEffect(() => {
    checkSSEConnection();
    const timer = setInterval(checkSSEConnection, 30000);
    return () => clearInterval(timer);
  }, [merchantId, checkSSEConnection]);
}

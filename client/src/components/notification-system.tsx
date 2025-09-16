import { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from "react";
import { X, Wifi, WifiOff, AlertTriangle, CheckCircle, Info, Smartphone, Monitor } from "lucide-react";
import { sseClient } from "@/lib/sse-client";

interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info" | "device";
  title: string;
  message: string;
  duration?: number; // milliseconds, 0 for persistent
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
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const notificationIds = useRef<Set<string>>(new Set());

  const addNotification = useCallback((notification: Omit<Notification, "id">) => {
    // Create unique key for deduplication
    const dedupeKey = `${notification.type}-${notification.title}-${notification.message}`;
    
    // Skip if duplicate notification is already shown (for persistent ones)
    if (notification.duration === 0 && notificationIds.current.has(dedupeKey)) {
      return;
    }

    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newNotification = { ...notification, id };
    
    // Track this notification
    notificationIds.current.add(dedupeKey);
    
    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove after duration (default 5 seconds)
    if (notification.duration !== 0) {
      const timeout = notification.duration || 5000;
      const timeoutId = setTimeout(() => {
        removeNotification(id);
      }, timeout);
      notificationTimeouts.current.set(id, timeoutId);
    }

    return id; // Return ID for tracking
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === id);
      if (notification) {
        // Remove from deduplication tracking
        const dedupeKey = `${notification.type}-${notification.title}-${notification.message}`;
        notificationIds.current.delete(dedupeKey);
      }
      return prev.filter(n => n.id !== id);
    });
    
    // Clear any pending timeout
    const timeoutId = notificationTimeouts.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      notificationTimeouts.current.delete(id);
    }
  }, []);

  const clearAll = useCallback(() => {
    // Clear all timeouts
    notificationTimeouts.current.forEach(timeout => clearTimeout(timeout));
    notificationTimeouts.current.clear();
    notificationIds.current.clear();
    setNotifications([]);
  }, []);

  const contextValue = useMemo(() => ({
    notifications,
    addNotification,
    removeNotification,
    clearAll
  }), [notifications, addNotification, removeNotification, clearAll]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
}

function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div 
      className="fixed top-4 right-4 z-50 space-y-3 max-w-sm"
      data-testid="notification-container"
    >
      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onRemove={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  );
}

function NotificationCard({ 
  notification, 
  onRemove 
}: { 
  notification: Notification;
  onRemove: () => void;
}) {
  const getNotificationStyles = () => {
    switch (notification.type) {
      case "success":
        return {
          icon: CheckCircle,
          bgColor: "bg-green-500/10",
          borderColor: "border-green-400/30",
          iconColor: "text-green-400",
          titleColor: "text-green-200",
          textColor: "text-green-300"
        };
      case "error":
        return {
          icon: AlertTriangle,
          bgColor: "bg-red-500/10",
          borderColor: "border-red-400/30",
          iconColor: "text-red-400",
          titleColor: "text-red-200",
          textColor: "text-red-300"
        };
      case "warning":
        return {
          icon: AlertTriangle,
          bgColor: "bg-orange-500/10",
          borderColor: "border-orange-400/30",
          iconColor: "text-orange-400",
          titleColor: "text-orange-200",
          textColor: "text-orange-300"
        };
      case "device":
        return {
          icon: Smartphone,
          bgColor: "bg-blue-500/10",
          borderColor: "border-blue-400/30",
          iconColor: "text-blue-400",
          titleColor: "text-blue-200",
          textColor: "text-blue-300"
        };
      default:
        return {
          icon: Info,
          bgColor: "bg-gray-500/10",
          borderColor: "border-gray-400/30",
          iconColor: "text-gray-400",
          titleColor: "text-gray-200",
          textColor: "text-gray-300"
        };
    }
  };

  const styles = getNotificationStyles();
  const Icon = styles.icon;

  return (
    <div 
      className={`backdrop-blur-xl border rounded-2xl p-4 shadow-2xl animate-in slide-in-from-right-full duration-300 ${styles.bgColor} ${styles.borderColor}`}
      data-testid={`notification-${notification.type}`}
    >
      <div className="flex items-start space-x-3">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${styles.iconColor}`} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <h4 className={`text-sm font-semibold ${styles.titleColor}`} data-testid="notification-title">
              {notification.title}
            </h4>
            <button
              onClick={onRemove}
              className={`ml-2 p-0.5 rounded-md hover:bg-white/10 transition-colors ${styles.iconColor}`}
              data-testid="notification-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <p className={`text-sm mt-1 ${styles.textColor}`} data-testid="notification-message">
            {notification.message}
          </p>
          
          {notification.actions && notification.actions.length > 0 && (
            <div className="flex space-x-2 mt-3">
              {notification.actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.onClick}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                    action.variant === "primary"
                      ? `bg-white/20 ${styles.titleColor} hover:bg-white/30`
                      : `bg-white/10 ${styles.textColor} hover:bg-white/20`
                  }`}
                  data-testid={`notification-action-${index}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Device status monitoring hook
export function useDeviceStatusMonitoring() {
  const { addNotification, removeNotification } = useNotifications();
  const offlineNotificationId = useRef<string | null>(null);
  const statusRefs = useRef({
    onlineStatusNotified: false,
    visibilityNotified: false,
    isInitialized: false
  });

  const handleOnline = useCallback(() => {
    // Remove persistent offline notification if it exists
    if (offlineNotificationId.current) {
      removeNotification(offlineNotificationId.current);
      offlineNotificationId.current = null;
    }

    // Show restoration message only if we were previously offline
    if (statusRefs.current.onlineStatusNotified && statusRefs.current.isInitialized) {
      addNotification({
        type: "success",
        title: "Connection Restored",
        message: "Your device is back online and payments can be processed.",
        duration: 4000
      });
    }
    statusRefs.current.onlineStatusNotified = true;
    statusRefs.current.isInitialized = true;
  }, [addNotification, removeNotification]);

  const handleOffline = useCallback(() => {
    // Only add notification if we don't already have one
    if (!offlineNotificationId.current) {
      const id = addNotification({
        type: "error",
        title: "Connection Lost",
        message: "No internet connection. Payments cannot be processed until connection is restored.",
        duration: 0, // Persistent until connection restored
        actions: [
          {
            label: "Retry",
            onClick: () => window.location.reload(),
            variant: "primary"
          }
        ]
      });
      offlineNotificationId.current = id || null;
    }
    statusRefs.current.onlineStatusNotified = true;
    statusRefs.current.isInitialized = true;
  }, [addNotification]);

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      if (!statusRefs.current.visibilityNotified) {
        addNotification({
          type: "device",
          title: "Device Inactive",
          message: "Payment terminal may miss transactions when the app is not active.",
          duration: 6000
        });
        statusRefs.current.visibilityNotified = true;
      }
    } else {
      // Reset when coming back
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
    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Check initial online status
    if (!navigator.onLine) {
      handleOffline();
    } else {
      statusRefs.current.isInitialized = true;
    }

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [handleOnline, handleOffline, handleVisibilityChange, handleBeforeUnload]);
}

// SSE connection monitoring hook
export function useSSEConnectionMonitoring(merchantId: number) {
  const { addNotification, removeNotification } = useNotifications();
  const sseNotificationId = useRef<string | null>(null);
  const statusRefs = useRef({
    connectionLostNotified: false,
    lastConnectionState: true,
    isInitialized: false
  });

  const checkSSEConnection = useCallback(() => {
    // Check SSE connection state - simplified check until we have public method
    // TODO: Add a public method to SSEClient to check connection status
    const sseConnected = navigator.onLine; // Basic check - can be enhanced later
    
    // Only proceed if the connection state has changed
    if (sseConnected === statusRefs.current.lastConnectionState && statusRefs.current.isInitialized) {
      return;
    }
    
    if (!sseConnected && !statusRefs.current.connectionLostNotified) {
      // Remove any existing notification first
      if (sseNotificationId.current) {
        removeNotification(sseNotificationId.current);
      }
      
      const id = addNotification({
        type: "warning",
        title: "Real-time Updates Disconnected",
        message: "Payment status updates may be delayed. Reconnecting...",
        duration: 0,
        actions: [
          {
            label: "Refresh",
            onClick: () => window.location.reload(),
            variant: "primary"
          }
        ]
      });
      sseNotificationId.current = id || null;
      statusRefs.current.connectionLostNotified = true;
    } else if (sseConnected && statusRefs.current.connectionLostNotified) {
      // Remove persistent disconnection notification
      if (sseNotificationId.current) {
        removeNotification(sseNotificationId.current);
        sseNotificationId.current = null;
      }
      
      // Show restoration message
      addNotification({
        type: "success",
        title: "Real-time Updates Restored",
        message: "Payment status updates are working normally.",
        duration: 3000
      });
      statusRefs.current.connectionLostNotified = false;
    }
    
    statusRefs.current.lastConnectionState = sseConnected;
    statusRefs.current.isInitialized = true;
  }, [addNotification, removeNotification]);

  useEffect(() => {
    // Initial check
    checkSSEConnection();
    
    // Check SSE connection every 30 seconds
    const reconnectionTimer = setInterval(checkSSEConnection, 30000);

    return () => {
      if (reconnectionTimer) {
        clearInterval(reconnectionTimer);
      }
    };
  }, [merchantId, checkSSEConnection]);
}
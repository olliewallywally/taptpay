import { useState, useEffect, useRef } from 'react';
import { Bell, X, AlertCircle, CheckCircle, Clock, DollarSign } from 'lucide-react';

interface Notification {
  id: string;
  type: 'warning' | 'error' | 'success' | 'info';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'error',
    title: 'API Down',
    message: 'Global Trade API is currently down and needs attention',
    time: '5 min ago',
    read: false,
  },
  {
    id: '2',
    type: 'warning',
    title: 'Payment Overdue',
    message: 'Digital Ventures owes $200 - 15 days overdue',
    time: '2 hours ago',
    read: false,
  },
  {
    id: '3',
    type: 'warning',
    title: 'Payment Overdue',
    message: 'Global Trade owes $150 - 12 days overdue',
    time: '3 hours ago',
    read: false,
  },
  {
    id: '4',
    type: 'info',
    title: 'Merchant Paused',
    message: 'E-Commerce Hub has paused their account',
    time: '1 day ago',
    read: true,
  },
  {
    id: '5',
    type: 'success',
    title: 'API Restored',
    message: 'RetailPro API is back online',
    time: '2 days ago',
    read: true,
  },
];

export default function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="size-4 text-[#ef4444]" />;
      case 'warning':
        return <DollarSign className="size-4 text-[#f59e0b]" />;
      case 'success':
        return <CheckCircle className="size-4 text-[#4ade80]" />;
      case 'info':
        return <Clock className="size-4 text-[#0055FF]" />;
      default:
        return null;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-[#ef4444]/20 bg-[#ef4444]/5';
      case 'warning':
        return 'border-[#f59e0b]/20 bg-[#f59e0b]/5';
      case 'success':
        return 'border-[#4ade80]/20 bg-[#4ade80]/5';
      case 'info':
        return 'border-[#0055FF]/20 bg-[#0055FF]/5';
      default:
        return 'border-[#dbdfea]/20';
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="size-8 sm:size-9 rounded-full bg-[#24263a] flex items-center justify-center hover:bg-[#2d2f45] transition-colors relative"
      >
        <svg className="size-3 sm:size-4" fill="none" viewBox="0 0 18 18">
          <path d="M13.5 6C13.5 4.80653 13.0259 3.66193 12.182 2.81802C11.3381 1.97411 10.1935 1.5 9 1.5C7.80653 1.5 6.66193 1.97411 5.81802 2.81802C4.97411 3.66193 4.5 4.80653 4.5 6C4.5 11.25 2.25 12.75 2.25 12.75H15.75C15.75 12.75 13.5 11.25 13.5 6Z" stroke="#DBDFEA" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.8" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-4 bg-[#ef4444] rounded-full flex items-center justify-center text-[8px] text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[#24263a] rounded-lg shadow-2xl border border-[#1d1e2c] z-50 max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#1d1e2c]">
            <div>
              <h3 className="text-[#dbdfea]">Notifications</h3>
              {unreadCount > 0 && (
                <p className="text-[#dbdfea]/60 text-xs">{unreadCount} unread</p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[#0055FF] text-xs hover:text-[#00E5CC] transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Bell className="size-12 text-[#dbdfea]/20 mb-3" />
                <p className="text-[#dbdfea]/60 text-sm text-center">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-[#1d1e2c]">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-[#1d1e2c] transition-colors ${
                      !notification.read ? 'bg-[#0055FF]/5' : ''
                    }`}
                    onClick={() => markAsRead(notification.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg border ${getColor(notification.type)}`}>
                        {getIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className={`text-sm ${!notification.read ? 'text-[#dbdfea]' : 'text-[#dbdfea]/80'}`}>
                            {notification.title}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className="text-[#dbdfea]/40 hover:text-[#ef4444] transition-colors flex-shrink-0"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <p className="text-[#dbdfea]/60 text-xs mb-2">{notification.message}</p>
                        <p className="text-[#dbdfea]/40 text-xs">{notification.time}</p>
                      </div>
                      {!notification.read && (
                        <div className="size-2 rounded-full bg-[#0055FF] flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
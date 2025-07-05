import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { QrCode, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navigation() {
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setLocation("/");
  };

  const isActive = (path: string) => location === path;

  return (
    <div className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <div className="w-8 h-8 bg-green-800 rounded flex items-center justify-center flex-shrink-0">
              <QrCode className="text-white text-sm" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">Tapt Payment Terminal</h1>
              {user && (
                <p className="text-xs sm:text-sm text-gray-600 truncate">Welcome back, {user.email}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <a 
                href="/merchant"
                className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  isActive("/merchant") 
                    ? "bg-white text-green-800 shadow-sm" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Terminal
              </a>
              <a 
                href="/dashboard"
                className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  isActive("/dashboard") 
                    ? "bg-white text-green-800 shadow-sm" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Dashboard
              </a>
              <a 
                href="/settings"
                className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  isActive("/settings") 
                    ? "bg-white text-green-800 shadow-sm" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Settings
              </a>
              <a 
                href="/exports"
                className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  isActive("/exports") 
                    ? "bg-white text-green-800 shadow-sm" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Exports
              </a>
              <a 
                href="/pay/1"
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  isActive("/pay/1") 
                    ? "bg-white text-green-800 shadow-sm" 
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Customer View
              </a>
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
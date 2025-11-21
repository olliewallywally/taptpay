import { useLocation, Route, Switch } from 'wouter';
import { Home, Users, Settings, Code, BarChart3, LogOut } from 'lucide-react';
import logoImage from "@assets/logo_1762915255857.png";

// Import admin sub-pages (we'll create these next)
import { GridDashboard } from './GridDashboard';
import { MerchantsPage } from './MerchantsPage';
import { MerchantDetail } from './MerchantDetail';
import { APIManagement } from './APIManagement';
import { Analytics } from './Analytics';
import { WebsiteAnalytics } from './WebsiteAnalytics';

export default function AdminDashboard() {
  const [location, setLocation] = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('adminAuthToken');
    localStorage.removeItem('adminUser');
    setLocation('/login');
  };

  const isActive = (path: string) => {
    if (path === '/admin' && location === '/admin') return true;
    if (path !== '/admin' && location.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="relative min-h-screen bg-[#1a1b2e] overflow-x-hidden">
      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#24263a] border-t border-[#1d1e2c] z-50 pb-safe">
        <div className="grid grid-cols-5 h-16">
          <button
            onClick={() => setLocation('/admin')}
            className={`flex flex-col items-center justify-center gap-1 ${
              isActive('/admin') ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
            data-testid="nav-admin-home"
          >
            <Home className="size-5" />
            <span className="text-[10px]">Home</span>
          </button>
          <button
            onClick={() => setLocation('/admin/merchants')}
            className={`flex flex-col items-center justify-center gap-1 ${
              isActive('/admin/merchants') ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
            data-testid="nav-admin-merchants"
          >
            <Users className="size-5" />
            <span className="text-[10px]">Merchants</span>
          </button>
          <button
            onClick={() => setLocation('/admin/analytics')}
            className={`flex flex-col items-center justify-center gap-1 ${
              isActive('/admin/analytics') ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
            data-testid="nav-admin-analytics"
          >
            <BarChart3 className="size-5" />
            <span className="text-[10px]">Analytics</span>
          </button>
          <button
            onClick={() => setLocation('/admin/api')}
            className={`flex flex-col items-center justify-center gap-1 ${
              isActive('/admin/api') ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
            data-testid="nav-admin-api"
          >
            <Code className="size-5" />
            <span className="text-[10px]">API</span>
          </button>
          <button
            onClick={() => setLocation('/admin/settings')}
            className={`flex flex-col items-center justify-center gap-1 ${
              isActive('/admin/settings') ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
            data-testid="nav-admin-settings"
          >
            <Settings className="size-5" />
            <span className="text-[10px]">Settings</span>
          </button>
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <aside className="hidden md:block fixed left-0 top-0 h-screen w-[180px] bg-[#24263a] rounded-br-[20px] rounded-tr-[20px] z-40">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-center h-[70px] border-b border-[#1d1e2c] px-4">
            <img src={logoImage} alt="TapTpay Logo" className="w-auto h-12" />
          </div>

          <nav className="flex-1 py-4">
            <button
              onClick={() => setLocation('/admin')}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                isActive('/admin') ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
              data-testid="sidebar-admin-dashboard"
            >
              <Home className="size-3.5" />
              Dashboard
            </button>
            <button
              onClick={() => setLocation('/admin/merchants')}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                isActive('/admin/merchants') ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
              data-testid="sidebar-admin-merchants"
            >
              <Users className="size-3.5" />
              Merchants
            </button>
            <button
              onClick={() => setLocation('/admin/api')}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                isActive('/admin/api') ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
              data-testid="sidebar-admin-api"
            >
              <Code className="size-3.5" />
              API Management
            </button>
            <button
              onClick={() => setLocation('/admin/analytics')}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                isActive('/admin/analytics') ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
              data-testid="sidebar-admin-analytics"
            >
              <BarChart3 className="size-3.5" />
              Analytics
            </button>
            <button
              onClick={() => setLocation('/admin/settings')}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                isActive('/admin/settings') ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
              data-testid="sidebar-admin-settings"
            >
              <Settings className="size-3.5" />
              Settings
            </button>
          </nav>

          <div className="border-t border-[#1d1e2c] p-4">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] hover:bg-[#1d1e2c] transition-colors rounded-lg"
              data-testid="button-admin-logout"
            >
              <LogOut className="size-3.5" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:ml-[180px] pb-20 md:pb-0">
        <Switch>
          <Route path="/admin" component={GridDashboard} />
          <Route path="/admin/merchants" component={MerchantsPage} />
          <Route path="/admin/merchants/:id">
            {(params) => <MerchantDetail merchantId={params.id} />}
          </Route>
          <Route path="/admin/api" component={APIManagement} />
          <Route path="/admin/analytics" component={Analytics} />
          <Route path="/admin/web-analytics" component={WebsiteAnalytics} />
          <Route path="/admin/settings">
            <div className="flex items-center justify-center h-screen text-[#dbdfea]">
              <div className="text-center">
                <Settings className="size-12 mx-auto mb-4 opacity-50" />
                <h2 className="text-xl">Settings</h2>
                <p className="text-sm text-[#dbdfea]/60 mt-2">Settings page coming soon</p>
              </div>
            </div>
          </Route>
        </Switch>
      </main>
    </div>
  );
}

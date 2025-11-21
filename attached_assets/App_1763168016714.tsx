import { useState } from 'react';
import GridDashboard from './components/GridDashboard';
import MerchantsPage from './components/MerchantsPage';
import MerchantDetail from './components/MerchantDetail';
import APIManagement from './components/APIManagement';
import Analytics from './components/Analytics';
import WebsiteAnalytics from './components/WebsiteAnalytics';
import NotificationPanel from './components/NotificationPanel';
import { Home, Users, Settings, Code, BarChart3, Bell, Activity } from 'lucide-react';
import taptpayLogo from 'figma:asset/987108cf9c4e186fbd1d468c6f1509d644b9173e.png';
import { Toaster } from './components/ui/sonner';

type Page = 'dashboard' | 'merchants' | 'api' | 'revenue-analytics' | 'web-analytics' | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);

  const renderPage = () => {
    if (selectedMerchant) {
      return <MerchantDetail merchantId={selectedMerchant} onBack={() => setSelectedMerchant(null)} />;
    }

    switch (currentPage) {
      case 'dashboard':
        return <GridDashboard onNavigate={(page) => setCurrentPage(page)} />;
      case 'merchants':
        return <MerchantsPage onSelectMerchant={setSelectedMerchant} />;
      case 'api':
        return <APIManagement />;
      case 'revenue-analytics':
        return <Analytics onSwitchView={() => setCurrentPage('web-analytics')} />;
      case 'web-analytics':
        return <WebsiteAnalytics onSwitchView={() => setCurrentPage('revenue-analytics')} />;
      case 'settings':
        return <div className="flex items-center justify-center h-full text-[#dbdfea]">Settings Page</div>;
      default:
        return <GridDashboard />;
    }
  };

  return (
    <div className="relative min-h-screen bg-[#1a1b2e] overflow-x-hidden">
      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#24263a] border-t border-[#1d1e2c] z-50 pb-safe">
        <div className="grid grid-cols-5 h-16">
          <button
            onClick={() => { setCurrentPage('dashboard'); setSelectedMerchant(null); }}
            className={`flex flex-col items-center justify-center gap-1 ${
              currentPage === 'dashboard' && !selectedMerchant ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
          >
            <Home className="size-5" />
            <span className="text-[10px]">Home</span>
          </button>
          <button
            onClick={() => { setCurrentPage('merchants'); setSelectedMerchant(null); }}
            className={`flex flex-col items-center justify-center gap-1 ${
              currentPage === 'merchants' || selectedMerchant ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
          >
            <Users className="size-5" />
            <span className="text-[10px]">Merchants</span>
          </button>
          <button
            onClick={() => { setCurrentPage('revenue-analytics'); setSelectedMerchant(null); }}
            className={`flex flex-col items-center justify-center gap-1 ${
              currentPage === 'revenue-analytics' && !selectedMerchant ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
          >
            <BarChart3 className="size-5" />
            <span className="text-[10px]">Analytics</span>
          </button>
          <button
            onClick={() => { setCurrentPage('api'); setSelectedMerchant(null); }}
            className={`flex flex-col items-center justify-center gap-1 ${
              currentPage === 'api' && !selectedMerchant ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
          >
            <Code className="size-5" />
            <span className="text-[10px]">API</span>
          </button>
          <button
            onClick={() => { setCurrentPage('settings'); setSelectedMerchant(null); }}
            className={`flex flex-col items-center justify-center gap-1 ${
              currentPage === 'settings' && !selectedMerchant ? 'text-[#0055FF]' : 'text-[#dbdfea]'
            }`}
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
            <img src={taptpayLogo} alt="Taptpay Logo" className="w-auto h-18" />
          </div>

          <nav className="flex-1 py-4">
            <button
              onClick={() => { setCurrentPage('dashboard'); setSelectedMerchant(null); }}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                currentPage === 'dashboard' && !selectedMerchant ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
            >
              <Home className="size-3.5" />
              Dashboard
            </button>
            <button
              onClick={() => { setCurrentPage('merchants'); setSelectedMerchant(null); }}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                currentPage === 'merchants' || selectedMerchant ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
            >
              <Users className="size-3.5" />
              Merchants
            </button>
            <button
              onClick={() => { setCurrentPage('api'); setSelectedMerchant(null); }}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                currentPage === 'api' && !selectedMerchant ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
            >
              <Code className="size-3.5" />
              API Management
            </button>
            <button
              onClick={() => { setCurrentPage('revenue-analytics'); setSelectedMerchant(null); }}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                currentPage === 'revenue-analytics' && !selectedMerchant ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
            >
              <BarChart3 className="size-3.5" />
              Analytics
            </button>
            <button
              onClick={() => { setCurrentPage('settings'); setSelectedMerchant(null); }}
              className={`w-full flex items-center gap-3 px-6 py-3 text-[#dbdfea] text-[10px] transition-colors ${
                currentPage === 'settings' && !selectedMerchant ? 'bg-[#1d1e2c]' : 'hover:bg-[#1d1e2c]'
              }`}
            >
              <Settings className="size-3.5" />
              Settings
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:ml-[180px] pb-20 md:pb-0">
        {renderPage()}
      </main>
      <Toaster />
    </div>
  );
}
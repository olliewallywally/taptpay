import { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { Dashboard } from './components/Dashboard';
import { StockPage } from './components/StockPage';
import { TerminalPage } from './components/TerminalPage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { SettingsPage } from './components/SettingsPage';
import { CustomerPaymentPage } from './components/CustomerPaymentPage';
import { Toaster } from './components/ui/sonner';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'stock' | 'terminal' | 'analytics' | 'settings' | 'payment'>('dashboard');

  useEffect(() => {
    // Check for existing session on mount
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        // Token exists, user is likely logged in
        // We'll verify on next API call, for now just restore the session
        setUser({ token: accessToken });
      }
    } catch (error) {
      console.error('Session check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (loggedInUser: any) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('accessToken');
      setUser(null);
      setCurrentPage('dashboard');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleNavigate = (page: 'dashboard' | 'stock' | 'terminal' | 'analytics' | 'settings' | 'payment') => {
    setCurrentPage(page);
  };

  // Show loading state while checking session
  if (loading) {
    return (
      <>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-[#0055FF]">Loading...</div>
        </div>
        <Toaster />
      </>
    );
  }

  // Show dashboard if user is logged in, otherwise show login page
  if (user) {
    if (currentPage === 'stock') {
      return (
        <>
          <StockPage user={user} onNavigate={handleNavigate} onLogout={handleLogout} />
          <Toaster />
        </>
      );
    }
    if (currentPage === 'terminal') {
      return (
        <>
          <TerminalPage user={user} onNavigate={handleNavigate} onLogout={handleLogout} />
          <Toaster />
        </>
      );
    }
    if (currentPage === 'analytics') {
      return (
        <>
          <AnalyticsPage user={user} onNavigate={handleNavigate} onLogout={handleLogout} />
          <Toaster />
        </>
      );
    }
    if (currentPage === 'settings') {
      return (
        <>
          <SettingsPage user={user} onNavigate={handleNavigate} onLogout={handleLogout} />
          <Toaster />
        </>
      );
    }
    if (currentPage === 'payment') {
      return (
        <>
          <CustomerPaymentPage onNavigate={handleNavigate} />
          <Toaster />
        </>
      );
    }
    return (
      <>
        <Dashboard user={user} onNavigate={handleNavigate} onLogout={handleLogout} />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <LoginPage onLoginSuccess={handleLoginSuccess} />
      <Toaster />
    </>
  );
}

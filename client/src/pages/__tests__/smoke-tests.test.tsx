import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { TooltipProvider } from '@/components/ui/tooltip';

// Type definitions for Jest globals
declare const jest: any;
declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeEach: any;
declare const afterEach: any;

// Import all page components to test
import AdminApi from '../admin-api';
import AdminDashboard from '../admin-dashboard';
import AdminLogin from '../admin-login';
import AdminMerchantBroken from '../admin-merchant-broken';
import AdminMerchant from '../admin-merchant';
import AdminRevenue from '../admin-revenue';
import CreateMerchant from '../create-merchant';
import CustomerPayment from '../customer-payment';
import Dashboard from '../dashboard';
import Exports from '../exports';
import ForgotPassword from '../forgot-password';
import Login from '../login';
import MerchantSignup from '../merchant-signup';
import MerchantTerminalMobile from '../merchant-terminal-mobile';
import MerchantTerminal from '../merchant-terminal';
import NfcPayment from '../nfc-payment';
import NotFound from '../not-found';
import Receipt from '../receipt';
import ResetPassword from '../reset-password';
import SettingsSimple from '../settings-simple';
import Settings from '../settings';
import StockManagement from '../stock-management';
import Transactions from '../transactions';
import VerifyMerchant from '../verify-merchant';

// Mock auth module
jest.mock('@/lib/auth', () => ({
  getCurrentMerchantId: jest.fn(() => 1),
  isAuthenticated: jest.fn(() => true),
  logout: jest.fn(),
}));

// Mock SSE client
jest.mock('@/lib/sse-client', () => ({
  sseClient: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));

// Mock hooks
jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Mock Recharts components to avoid complex rendering issues
jest.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}));

// Mock QR code component
jest.mock('@/components/qr-code-display', () => ({
  QRCodeDisplay: () => <div data-testid="qr-code-display">QR Code</div>,
}));

// Test wrapper component with required providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </Router>
    </QueryClientProvider>
  );
};

// Mock fetch responses for API calls
beforeEach(() => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({
      id: 1,
      name: 'Test Merchant',
      totalRevenue: 1000,
      totalTransactions: 50,
      completedTransactions: 45,
      pendingTransactions: 5,
      weeklyTransactions: 10,
    }),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// Page components that need special mock params
const componentsWithParams = [
  { name: 'AdminMerchant', component: AdminMerchant },
  { name: 'CustomerPayment', component: CustomerPayment },
  { name: 'Receipt', component: Receipt },
];

describe('Page Components Smoke Tests', () => {
  // Test components without special requirements
  const basicComponents = [
    { name: 'AdminApi', component: AdminApi },
    { name: 'AdminDashboard', component: AdminDashboard },
    { name: 'AdminLogin', component: AdminLogin },
    { name: 'AdminMerchantBroken', component: AdminMerchantBroken },
    { name: 'AdminRevenue', component: AdminRevenue },
    { name: 'CreateMerchant', component: CreateMerchant },
    { name: 'Dashboard', component: Dashboard },
    { name: 'Exports', component: Exports },
    { name: 'ForgotPassword', component: ForgotPassword },
    { name: 'Login', component: Login },
    { name: 'MerchantSignup', component: MerchantSignup },
    { name: 'MerchantTerminalMobile', component: MerchantTerminalMobile },
    { name: 'MerchantTerminal', component: MerchantTerminal },
    { name: 'NfcPayment', component: NfcPayment },
    { name: 'NotFound', component: NotFound },
    { name: 'ResetPassword', component: ResetPassword },
    { name: 'SettingsSimple', component: SettingsSimple },
    { name: 'Settings', component: Settings },
    { name: 'StockManagement', component: StockManagement },
    { name: 'Transactions', component: Transactions },
    { name: 'VerifyMerchant', component: VerifyMerchant },
  ];

  basicComponents.forEach(({ name, component: Component }) => {
    it(`should render ${name} without crashing`, () => {
      expect(() => {
        render(
          <TestWrapper>
            <Component />
          </TestWrapper>
        );
      }).not.toThrow();
    });
  });

  // Test components that require URL parameters
  it('should render AdminMerchant without crashing', () => {
    // Mock useParams hook for AdminMerchant
    jest.doMock('wouter', () => ({
      ...jest.requireActual('wouter'),
      useParams: () => ({ merchantId: '1' }),
    }));

    expect(() => {
      render(
        <TestWrapper>
          <AdminMerchant />
        </TestWrapper>
      );
    }).not.toThrow();
  });

  it('should render CustomerPayment without crashing', () => {
    // Mock useParams and useLocation hooks for CustomerPayment
    jest.doMock('wouter', () => ({
      ...jest.requireActual('wouter'),
      useParams: () => ({ merchantId: '1' }),
      useLocation: () => ['/pay/1', jest.fn()],
    }));

    expect(() => {
      render(
        <TestWrapper>
          <CustomerPayment />
        </TestWrapper>
      );
    }).not.toThrow();
  });

  it('should render Receipt without crashing', () => {
    // Mock useParams hook for Receipt
    jest.doMock('wouter', () => ({
      ...jest.requireActual('wouter'),
      useParams: () => ({ transactionId: '1' }),
    }));

    expect(() => {
      render(
        <TestWrapper>
          <Receipt />
        </TestWrapper>
      );
    }).not.toThrow();
  });
});

describe('JSX Syntax Validation', () => {
  it('should validate all page components have valid JSX syntax', () => {
    // This test will fail at import time if any component has JSX syntax errors
    const allComponents = [
      AdminApi, AdminDashboard, AdminLogin, AdminMerchantBroken, AdminMerchant,
      AdminRevenue, CreateMerchant, CustomerPayment, Dashboard, Exports,
      ForgotPassword, Login, MerchantSignup, MerchantTerminalMobile, MerchantTerminal,
      NfcPayment, NotFound, Receipt, ResetPassword, SettingsSimple, Settings,
      StockManagement, Transactions, VerifyMerchant
    ];

    // If we reach this point, all imports succeeded (no syntax errors)
    expect(allComponents).toHaveLength(24);
    allComponents.forEach(component => {
      expect(typeof component).toBe('function');
    });
  });
});
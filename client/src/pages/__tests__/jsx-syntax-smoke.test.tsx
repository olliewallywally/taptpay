/**
 * JSX Syntax Smoke Tests
 * 
 * This test file imports all page components to catch JSX syntax errors early.
 * If any component has JSX syntax errors, the test will fail during the import phase.
 * This acts as an early warning system for broken JSX before deployment.
 */

// Dynamic imports to test JSX syntax - syntax errors will cause import failures
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Test wrapper for React Query
const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

// Mock necessary modules to avoid runtime issues
jest.mock('@/lib/auth', () => ({
  getCurrentMerchantId: () => 1,
  isAuthenticated: () => true,
}));

jest.mock('wouter', () => ({
  Router: ({ children }: any) => <div>{children}</div>,
  useParams: () => ({ merchantId: '1', transactionId: '1' }),
  useLocation: () => ['/', jest.fn()],
  Link: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe('JSX Syntax Smoke Tests', () => {
  let TestWrapper: ReturnType<typeof createTestWrapper>;

  beforeEach(() => {
    TestWrapper = createTestWrapper();
    // Mock fetch for API calls
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Page Components JSX Syntax', () => {
    // Test each page component for JSX syntax errors
    
    test('NotFound component has valid JSX', async () => {
      const { default: NotFound } = await import('../not-found');
      expect(() => render(<NotFound />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('Login component has valid JSX', async () => {
      const { default: Login } = await import('../login');
      expect(() => render(<Login />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('ForgotPassword component has valid JSX', async () => {
      const { default: ForgotPassword } = await import('../forgot-password');
      expect(() => render(<ForgotPassword />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('ResetPassword component has valid JSX', async () => {
      const { default: ResetPassword } = await import('../reset-password');
      expect(() => render(<ResetPassword />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('MerchantSignup component has valid JSX', async () => {
      const { default: MerchantSignup } = await import('../merchant-signup');
      expect(() => render(<MerchantSignup />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('CreateMerchant component has valid JSX', async () => {
      const { default: CreateMerchant } = await import('../create-merchant');
      expect(() => render(<CreateMerchant />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('VerifyMerchant component has valid JSX', async () => {
      const { default: VerifyMerchant } = await import('../verify-merchant');
      expect(() => render(<VerifyMerchant />, { wrapper: TestWrapper })).not.toThrow();
    });
  });

  describe('Authenticated Page Components JSX Syntax', () => {
    test('Dashboard component has valid JSX', async () => {
      const { default: Dashboard } = await import('../dashboard');
      expect(() => render(<Dashboard />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('Transactions component has valid JSX', async () => {
      const { default: Transactions } = await import('../transactions');
      expect(() => render(<Transactions />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('Settings component has valid JSX', async () => {
      const { default: Settings } = await import('../settings');
      expect(() => render(<Settings />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('SettingsSimple component has valid JSX', async () => {
      const { default: SettingsSimple } = await import('../settings-simple');
      expect(() => render(<SettingsSimple />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('StockManagement component has valid JSX', async () => {
      const { default: StockManagement } = await import('../stock-management');
      expect(() => render(<StockManagement />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('Exports component has valid JSX', async () => {
      const { default: Exports } = await import('../exports');
      expect(() => render(<Exports />, { wrapper: TestWrapper })).not.toThrow();
    });
  });

  describe('Terminal Components JSX Syntax', () => {
    test('MerchantTerminal component has valid JSX', async () => {
      const { default: MerchantTerminal } = await import('../merchant-terminal');
      expect(() => render(<MerchantTerminal />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('MerchantTerminalMobile component has valid JSX', async () => {
      const { default: MerchantTerminalMobile } = await import('../merchant-terminal-mobile');
      expect(() => render(<MerchantTerminalMobile />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('CustomerPayment component has valid JSX', async () => {
      const { default: CustomerPayment } = await import('../customer-payment');
      expect(() => render(<CustomerPayment />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('NfcPayment component has valid JSX', async () => {
      const { default: NfcPayment } = await import('../nfc-payment');
      expect(() => render(<NfcPayment />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('Receipt component has valid JSX', async () => {
      const { default: Receipt } = await import('../receipt');
      expect(() => render(<Receipt />, { wrapper: TestWrapper })).not.toThrow();
    });
  });

  describe('Admin Components JSX Syntax', () => {
    test('AdminLogin component has valid JSX', async () => {
      const { default: AdminLogin } = await import('../admin-login');
      expect(() => render(<AdminLogin />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('AdminDashboard component has valid JSX', async () => {
      const { default: AdminDashboard } = await import('../admin-dashboard');
      expect(() => render(<AdminDashboard />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('AdminMerchant component has valid JSX', async () => {
      const { default: AdminMerchant } = await import('../admin-merchant');
      expect(() => render(<AdminMerchant />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('AdminMerchantBroken component has valid JSX', async () => {
      const { default: AdminMerchantBroken } = await import('../admin-merchant-broken');
      expect(() => render(<AdminMerchantBroken />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('AdminRevenue component has valid JSX', async () => {
      const { default: AdminRevenue } = await import('../admin-revenue');
      expect(() => render(<AdminRevenue />, { wrapper: TestWrapper })).not.toThrow();
    });

    test('AdminApi component has valid JSX', async () => {
      const { default: AdminApi } = await import('../admin-api');
      expect(() => render(<AdminApi />, { wrapper: TestWrapper })).not.toThrow();
    });
  });
});

describe('Import Validation', () => {
  test('All page components can be imported (syntax check)', async () => {
    // This test will fail immediately if any component has JSX syntax errors
    const componentImports = [
      () => import('../admin-api'),
      () => import('../admin-dashboard'),
      () => import('../admin-login'),
      () => import('../admin-merchant-broken'),
      () => import('../admin-merchant'),
      () => import('../admin-revenue'),
      () => import('../create-merchant'),
      () => import('../customer-payment'),
      () => import('../dashboard'),
      () => import('../exports'),
      () => import('../forgot-password'),
      () => import('../login'),
      () => import('../merchant-signup'),
      () => import('../merchant-terminal-mobile'),
      () => import('../merchant-terminal'),
      () => import('../nfc-payment'),
      () => import('../not-found'),
      () => import('../receipt'),
      () => import('../reset-password'),
      () => import('../settings-simple'),
      () => import('../settings'),
      () => import('../stock-management'),
      () => import('../transactions'),
      () => import('../verify-merchant'),
    ];

    // Test all imports simultaneously
    const importPromises = componentImports.map(async (importFn, index) => {
      try {
        const module = await importFn();
        return {
          index,
          success: true,
          hasDefault: !!module.default,
        };
      } catch (error) {
        return {
          index,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const results = await Promise.all(importPromises);
    const failures = results.filter(result => !result.success);

    if (failures.length > 0) {
      console.error('Import failures:', failures);
      throw new Error(`${failures.length} components failed to import, likely due to JSX syntax errors`);
    }

    // All components should import successfully and have default exports
    expect(results).toHaveLength(24);
    expect(results.every(result => result.success && result.hasDefault)).toBe(true);
  });
});
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
import { NotificationProvider } from '@/components/notification-system';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TutorialProvider } from '@/features/tutorial/tutorial';

// Test wrapper for React Query. NotificationProvider/TooltipProvider are required
// by the terminal pages (useNotifications / tooltip) or they throw at render.
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
        <TutorialProvider enabled={false}>
          <NotificationProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </NotificationProvider>
        </TutorialProvider>
      </QueryClientProvider>
    );
  };
};

// Mock necessary modules to avoid runtime issues
jest.mock('@/lib/auth', () => ({
  getCurrentMerchantId: () => 1,
  isAuthenticated: () => true,
}));

jest.mock('@/lib/sse-client', () => ({
  sseClient: {
    connect: jest.fn(),
    connectCustomer: jest.fn(),
    connectMerchant: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));

jest.mock('wouter', () => ({
  Router: ({ children }: any) => <div>{children}</div>,
  useParams: () => ({ merchantId: '1', transactionId: '1' }),
  useLocation: () => ['/', jest.fn()],
  // reset-password / receipt read query params via useSearch.
  useSearch: () => '',
  Link: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// R1-T8: these check the first render only (JSX and hooks). Unmount before any
// request resolves — the mocked responses are not shaped for every page, and a
// response landing after the test is an update outside act(), which
// jest.setup.js now fails.
function rendersFirstFrame(ui: React.ReactElement, wrapper: React.ComponentType<{ children: React.ReactNode }>) {
  let view: { unmount: () => void } | undefined;
  expect(() => { view = render(ui, { wrapper }); }).not.toThrow();
  view?.unmount();
}

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
      rendersFirstFrame(<NotFound />, TestWrapper);
    });

    test('Login component has valid JSX', async () => {
      const { default: Login } = await import('../login');
      rendersFirstFrame(<Login />, TestWrapper);
    });

    test('ForgotPassword component has valid JSX', async () => {
      const { default: ForgotPassword } = await import('../forgot-password');
      rendersFirstFrame(<ForgotPassword />, TestWrapper);
    });

    test('ResetPassword component has valid JSX', async () => {
      const { default: ResetPassword } = await import('../reset-password');
      rendersFirstFrame(<ResetPassword />, TestWrapper);
    });

    test('MerchantSignup component has valid JSX', async () => {
      const { default: MerchantSignup } = await import('../merchant-signup');
      rendersFirstFrame(<MerchantSignup />, TestWrapper);
    });

    test('CreateMerchant component has valid JSX', async () => {
      const { default: CreateMerchant } = await import('../create-merchant');
      rendersFirstFrame(<CreateMerchant />, TestWrapper);
    });
  });

  describe('Authenticated Page Components JSX Syntax', () => {
    test('Dashboard component has valid JSX', async () => {
      const { default: Dashboard } = await import('../dashboard');
      rendersFirstFrame(<Dashboard />, TestWrapper);
    });

    test('Transactions component has valid JSX', async () => {
      const { default: Transactions } = await import('../transactions');
      rendersFirstFrame(<Transactions />, TestWrapper);
    });

    test('Settings component has valid JSX', async () => {
      const { default: Settings } = await import('../settings');
      rendersFirstFrame(<Settings />, TestWrapper);
    });

    test('SettingsSimple component has valid JSX', async () => {
      const { default: SettingsSimple } = await import('../settings-simple');
      rendersFirstFrame(<SettingsSimple />, TestWrapper);
    });

    test('StockManagement component has valid JSX', async () => {
      const { default: StockManagement } = await import('../stock-management');
      rendersFirstFrame(<StockManagement />, TestWrapper);
    });

    test('Exports component has valid JSX', async () => {
      const { default: Exports } = await import('../exports');
      rendersFirstFrame(<Exports />, TestWrapper);
    });
  });

  describe('Terminal Components JSX Syntax', () => {
    test('MerchantTerminal component has valid JSX', async () => {
      const { default: MerchantTerminal } = await import('../merchant-terminal');
      rendersFirstFrame(<MerchantTerminal />, TestWrapper);
    });

    test('MerchantTerminalMobile component has valid JSX', async () => {
      const { default: MerchantTerminalMobile } = await import('../merchant-terminal-mobile');
      rendersFirstFrame(<MerchantTerminalMobile />, TestWrapper);
    });

    test('CustomerPayment component has valid JSX', async () => {
      const { default: CustomerPayment } = await import('../customer-payment');
      rendersFirstFrame(<CustomerPayment />, TestWrapper);
    });

    test('NfcPayment component has valid JSX', async () => {
      const { default: NfcPayment } = await import('../nfc-payment');
      rendersFirstFrame(<NfcPayment />, TestWrapper);
    });

    test('Receipt component has valid JSX', async () => {
      const { default: Receipt } = await import('../receipt');
      rendersFirstFrame(<Receipt />, TestWrapper);
    });
  });

  describe('Admin Components JSX Syntax', () => {
    test('AdminLogin component has valid JSX', async () => {
      const { default: AdminLogin } = await import('../admin-login');
      rendersFirstFrame(<AdminLogin />, TestWrapper);
    });

    test('AdminDashboard component has valid JSX', async () => {
      const { default: AdminDashboard } = await import('../admin-dashboard');
      rendersFirstFrame(<AdminDashboard />, TestWrapper);
    });

    test('AdminMerchant component has valid JSX', async () => {
      const { default: AdminMerchant } = await import('../admin-merchant');
      rendersFirstFrame(<AdminMerchant />, TestWrapper);
    });

    test('AdminMerchantBroken component has valid JSX', async () => {
      const { default: AdminMerchantBroken } = await import('../admin-merchant-broken');
      rendersFirstFrame(<AdminMerchantBroken />, TestWrapper);
    });

    test('AdminRevenue component has valid JSX', async () => {
      const { default: AdminRevenue } = await import('../admin-revenue');
      rendersFirstFrame(<AdminRevenue />, TestWrapper);
    });

    test('AdminApi component has valid JSX', async () => {
      const { default: AdminApi } = await import('../admin-api');
      rendersFirstFrame(<AdminApi />, TestWrapper);
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

    // All components should import successfully and have default exports.
    // Count is 23 since verify-merchant was removed in the onboarding consolidation.
    expect(results).toHaveLength(23);
    expect(results.every(result => result.success && result.hasDefault)).toBe(true);
  });
});

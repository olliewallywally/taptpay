/**
 * Smoke Tests for JSX Syntax Validation
 * 
 * This test file imports all page components to catch JSX syntax errors early.
 * It performs lightweight syntax validation by importing each component.
 * If any component has JSX syntax errors, the test will fail at import time.
 */

// Simple syntax validation - just importing the components will catch JSX errors
describe('JSX Syntax Validation', () => {
  test('AdminApi component has valid JSX syntax', () => {
    expect(() => {
      require('../admin-api');
    }).not.toThrow();
  });

  test('AdminDashboard component has valid JSX syntax', () => {
    expect(() => {
      require('../admin-dashboard');
    }).not.toThrow();
  });

  test('AdminLogin component has valid JSX syntax', () => {
    expect(() => {
      require('../admin-login');
    }).not.toThrow();
  });

  test('AdminMerchantBroken component has valid JSX syntax', () => {
    expect(() => {
      require('../admin-merchant-broken');
    }).not.toThrow();
  });

  test('AdminMerchant component has valid JSX syntax', () => {
    expect(() => {
      require('../admin-merchant');
    }).not.toThrow();
  });

  test('AdminRevenue component has valid JSX syntax', () => {
    expect(() => {
      require('../admin-revenue');
    }).not.toThrow();
  });

  test('CreateMerchant component has valid JSX syntax', () => {
    expect(() => {
      require('../create-merchant');
    }).not.toThrow();
  });

  test('CustomerPayment component has valid JSX syntax', () => {
    expect(() => {
      require('../customer-payment');
    }).not.toThrow();
  });

  test('Dashboard component has valid JSX syntax', () => {
    expect(() => {
      require('../dashboard');
    }).not.toThrow();
  });

  test('Exports component has valid JSX syntax', () => {
    expect(() => {
      require('../exports');
    }).not.toThrow();
  });

  test('ForgotPassword component has valid JSX syntax', () => {
    expect(() => {
      require('../forgot-password');
    }).not.toThrow();
  });

  test('Login component has valid JSX syntax', () => {
    expect(() => {
      require('../login');
    }).not.toThrow();
  });

  test('MerchantSignup component has valid JSX syntax', () => {
    expect(() => {
      require('../merchant-signup');
    }).not.toThrow();
  });

  test('MerchantTerminalMobile component has valid JSX syntax', () => {
    expect(() => {
      require('../merchant-terminal-mobile');
    }).not.toThrow();
  });

  test('MerchantTerminal component has valid JSX syntax', () => {
    expect(() => {
      require('../merchant-terminal');
    }).not.toThrow();
  });

  test('NfcPayment component has valid JSX syntax', () => {
    expect(() => {
      require('../nfc-payment');
    }).not.toThrow();
  });

  test('NotFound component has valid JSX syntax', () => {
    expect(() => {
      require('../not-found');
    }).not.toThrow();
  });

  test('Receipt component has valid JSX syntax', () => {
    expect(() => {
      require('../receipt');
    }).not.toThrow();
  });

  test('ResetPassword component has valid JSX syntax', () => {
    expect(() => {
      require('../reset-password');
    }).not.toThrow();
  });

  test('SettingsSimple component has valid JSX syntax', () => {
    expect(() => {
      require('../settings-simple');
    }).not.toThrow();
  });

  test('Settings component has valid JSX syntax', () => {
    expect(() => {
      require('../settings');
    }).not.toThrow();
  });

  test('StockManagement component has valid JSX syntax', () => {
    expect(() => {
      require('../stock-management');
    }).not.toThrow();
  });

  test('Transactions component has valid JSX syntax', () => {
    expect(() => {
      require('../transactions');
    }).not.toThrow();
  });

  test('VerifyMerchant component has valid JSX syntax', () => {
    expect(() => {
      require('../verify-merchant');
    }).not.toThrow();
  });
});

describe('Component Import Test', () => {
  test('All page components can be imported successfully', () => {
    const componentPaths = [
      '../admin-api',
      '../admin-dashboard', 
      '../admin-login',
      '../admin-merchant-broken',
      '../admin-merchant',
      '../admin-revenue',
      '../create-merchant',
      '../customer-payment',
      '../dashboard',
      '../exports',
      '../forgot-password',
      '../login',
      '../merchant-signup',
      '../merchant-terminal-mobile',
      '../merchant-terminal',
      '../nfc-payment',
      '../not-found',
      '../receipt',
      '../reset-password',
      '../settings-simple',
      '../settings',
      '../stock-management',
      '../transactions',
      '../verify-merchant'
    ];

    const importResults = componentPaths.map(path => {
      try {
        const component = require(path);
        return {
          path,
          success: true,
          component: component.default || component,
        };
      } catch (error) {
        return {
          path,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const failed = importResults.filter(result => !result.success);
    
    if (failed.length > 0) {
      console.error('Failed imports:', failed);
      throw new Error(`${failed.length} components failed to import: ${failed.map(f => f.path).join(', ')}`);
    }

    expect(importResults).toHaveLength(24);
    expect(importResults.every(result => result.success)).toBe(true);
  });
});
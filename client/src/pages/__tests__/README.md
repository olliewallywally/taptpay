# JSX Syntax Smoke Tests

This directory contains smoke tests designed to catch JSX syntax errors early in the development process.

## Purpose

These tests import all page components and attempt to render them. If any component has JSX syntax errors, the tests will fail immediately, preventing broken code from reaching production.

## Files

- `syntax-validation.test.tsx` - Basic import-based syntax validation using require()
- `jsx-syntax-smoke.test.tsx` - More comprehensive tests using dynamic imports and React Testing Library

## Running the Tests

To run the smoke tests, use one of these commands:

```bash
# Run all tests
npx jest --config=jest.config.cjs

# Run only syntax validation tests
npx jest --testPathPatterns="syntax-validation.test.tsx" --config=jest.config.cjs

# Run JSX smoke tests
npx jest --testPathPatterns="jsx-syntax-smoke.test.tsx" --config=jest.config.cjs

# Run with verbose output
npx jest --verbose --config=jest.config.cjs
```

## How It Works

The tests work by:

1. **Import Phase**: Each page component is dynamically imported
2. **Syntax Detection**: If any component has JSX syntax errors (like unclosed tags, invalid JSX, etc.), the import will fail
3. **Early Failure**: Tests fail immediately when syntax errors are detected
4. **Comprehensive Coverage**: All 24 page components are tested

## Components Tested

The following page components are covered:
- AdminApi, AdminDashboard, AdminLogin, AdminMerchant, AdminMerchantBroken, AdminRevenue
- CreateMerchant, CustomerPayment, Dashboard, Exports, ForgotPassword, Login
- MerchantSignup, MerchantTerminal, MerchantTerminalMobile, NfcPayment, NotFound
- Receipt, ResetPassword, Settings, SettingsSimple, StockManagement, Transactions, VerifyMerchant

## Expected Behavior

- ✅ **Success**: All tests pass when components have valid JSX syntax
- ❌ **Failure**: Tests fail immediately when JSX syntax errors are present
- 🔍 **Detection**: Common errors like unclosed tags, invalid attributes, malformed JSX will be caught

## Integration with CI/CD

To integrate these tests into your deployment pipeline, add this command to your build process:

```bash
npx jest client/src/pages/__tests__ --config=jest.config.cjs --passWithNoTests
```

This ensures that any JSX syntax errors will prevent deployment.

## Configuration Files

- `jest.config.cjs` - Jest configuration for CommonJS modules
- `babel.config.cjs` - Babel configuration for JSX transformation
- `jest.setup.js` - Test environment setup and mocks
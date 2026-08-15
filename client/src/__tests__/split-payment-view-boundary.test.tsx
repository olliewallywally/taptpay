import fs from 'node:fs';
import path from 'node:path';
import { configure, fireEvent, render, screen } from '@testing-library/react';
import {
  SplitPaymentView,
  type SplitPaymentViewProps,
} from '@/features/checkout/SplitPaymentView';

configure({ testIdAttribute: 'data-demo-id' });
const sourcePath = path.resolve(
  process.cwd(),
  'client/src/features/checkout/SplitPaymentView.tsx'
);
const controllerPath = path.resolve(
  process.cwd(),
  'client/src/pages/split-payment.tsx'
);
const forbidden = [
  /from\s+["']wouter["']/,
  /@tanstack\/react-query/,
  /@\/lib\/(?:queryClient|sse-client)/,
  /(?:^|[\/])checkout(?:\.|[\/])/im,
  /\b(?:fetch|XMLHttpRequest|EventSource|WebSocket)\s*\(/,
  /\bapiRequest\b/,
  /\blocalStorage\b|\bsessionStorage\b/,
  /\bPaymentRequest\b|ApplePaySession|GooglePay/,
  /\bwindow\.(?:location|open|history)\b/,
  /\bnavigator\.(?:clipboard|share)\b/,
  /\buseEffect\b/,
  /useParams|useLocation/,
];

function props(
  overrides: Partial<SplitPaymentViewProps> = {}
): SplitPaymentViewProps {
  return {
    model: {
      itemName: 'Shared table',
      totalAmount: 120,
      splitSetup: false,
      completedSplits: 0,
      allowCustomAmount: true,
    },
    onPay: jest.fn(),
    onDone: jest.fn(),
    ...overrides,
  };
}

describe('SplitPaymentView extraction boundary', () => {
  test('contains no production controller or external-effect capability', () => {
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const rule of forbidden) expect(source).not.toMatch(rule);
  });

  test('the production controller renders the view and retains its real adapters', () => {
    const controller = fs.readFileSync(controllerPath, 'utf8');
    expect(controller).toMatch(
      /from\s+['"]@\/features\/checkout\/SplitPaymentView['"]/
    );
    expect(controller).toContain('<SplitPaymentView');
    expect(controller).toContain('sseClient.connectCustomer');
    expect(controller).toContain('checkoutResolveEndpoint');
    expect(controller).toContain('tokenSplitEndpoint(token)');
    expect(controller).toMatch(/tokenPaymentPath\(token,\s*['"]checkout['"]\)/);
    expect(controller).toContain('`/api/transactions/${txnId}/split`');
    expect(controller).toContain('`/api/transactions/${txnId}/pay`');
    expect(controller).toContain('window.location.href = payData.hppUrl');
  });

  test('delegates a four-way equal share through the real count controls', () => {
    const onPay = jest.fn();
    render(<SplitPaymentView {...props({ onPay })} />);
    fireEvent.click(screen.getByTestId('split-more'));
    fireEvent.click(screen.getByTestId('split-more'));
    expect(screen.getByText('4 people')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('split-pay'));
    expect(onPay).toHaveBeenCalledWith({ amount: 30, splitCount: 4 });
  });

  test('preserves first-payer progress, custom amount, and full-payment controls', () => {
    const onPay = jest.fn();
    const onPayFull = jest.fn();
    render(<SplitPaymentView {...props({ onPay, onPayFull })} />);

    expect(screen.getByText('0 of 2 paid')).toBeInTheDocument();
    expect(screen.getByTestId('split-progress')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('split-edit-first'));
    expect(screen.getByLabelText('Your payment amount')).toHaveValue(120);
    fireEvent.change(screen.getByLabelText('Your payment amount'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByTestId('split-confirm-first'));
    expect(screen.getByText('your amount:')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('split-pay'));
    expect(onPay).toHaveBeenCalledWith({ amount: 45, splitCount: 2 });
    fireEvent.click(screen.getByTestId('split-pay-full'));
    expect(onPayFull).toHaveBeenCalledTimes(1);
  });

  test("uses the token flow's existing truncate-to-cent share rule", () => {
    const onPay = jest.fn();
    render(
      <SplitPaymentView
        {...props({
          model: {
            itemName: 'Shared table',
            totalAmount: 100,
            splitSetup: false,
            completedSplits: 0,
            truncateEqualShares: true,
          },
          onPay,
        })}
      />
    );
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByTestId('split-more'));
    }
    expect(screen.getByText('$16.66')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('split-pay'));
    expect(onPay).toHaveBeenCalledWith({ amount: 16.66, splitCount: 6 });
  });

  test('presents resolved progress and completion', () => {
    const { rerender } = render(
      <SplitPaymentView
        {...props({
          model: {
            itemName: 'Shared table',
            totalAmount: 120,
            splitSetup: true,
            completedSplits: 1,
            totalSplits: 4,
            subsequentShare: '30.00',
            remainingAmount: 90,
          },
        })}
      />
    );
    expect(screen.getByText('1 of 4 paid')).toBeInTheDocument();
    expect(screen.getByTestId('split-progress')).toBeInTheDocument();
    rerender(
      <SplitPaymentView
        {...props({
          model: {
            itemName: 'Shared table',
            totalAmount: 120,
            splitSetup: true,
            completedSplits: 4,
            totalSplits: 4,
            subsequentShare: '30.00',
            remainingAmount: 0,
            allDone: true,
          },
        })}
      />
    );
    expect(screen.getByTestId('split-complete')).toHaveTextContent(
      'All 4 payments complete'
    );
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRestart = jest.fn();
const mockToast = jest.fn();
jest.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => ({ enabled: false, loading: false, supported: false, available: false, toggle: jest.fn() }) }));
jest.mock('@/hooks/use-billing-card-return', () => ({ BILLING_CARD_SESSION_KEY: 'fixture', useBillingCardReturn: () => ({ confirmingCard: false }) }));
jest.mock('@/features/tutorial/tutorial', () => ({ useTutorial: () => ({ restartTutorials: mockRestart, visitedPages: 5, pageCount: 20, isRestarting: false, canRestart: true }) }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('wouter', () => ({ useLocation: () => ['/settings', jest.fn()] }));
jest.mock('@/lib/queryClient', () => ({ apiRequest: jest.fn(async () => ({ ok: true, json: async () => ({}) })) }));

import Settings from '@/pages/settings';
import { holdSession, releaseSession } from '@/lib/session';

beforeEach(() => {
  mockRestart.mockReset().mockResolvedValue(undefined); mockToast.mockClear();
  holdSession('business', { id: 7, email: 'owner@example.test', merchantId: 22, role: 'owner' }, 'fixture-csrf');
  jest.spyOn(globalThis, 'fetch').mockImplementation(async url => ({ ok: true, status: 200, json: async () => url === '/api/merchants/22/profile' ? { id: 22, businessName: 'Synthetic Merchant', status: 'active' } : {} }) as Response);
});
afterEach(() => { releaseSession('business'); jest.restoreAllMocks(); });

async function openRestart() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><Settings /></QueryClientProvider>);
  await userEvent.click(await screen.findByTestId('settings-row-tutorial'));
  return screen.findByTestId('button-restart-tutorials');
}

test('successful phone restart returns to the grouped Settings controls the tutorial describes', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(await openRestart());
  await waitFor(() => expect(mockRestart).toHaveBeenCalledTimes(1));
  expect(await screen.findByTestId('settings-row-business')).toBeVisible();
  expect(screen.queryByTestId('button-restart-tutorials')).not.toBeInTheDocument();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tutorials restarted' }));
});

test('declining restart preserves the current section without changing progress', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.click(await openRestart());
  expect(mockRestart).not.toHaveBeenCalled();
  expect(screen.getByTestId('button-restart-tutorials')).toBeVisible();
});

test('a failed restart keeps the current section and reports failure', async () => {
  mockRestart.mockRejectedValue(new Error('Unavailable'));
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(await openRestart());
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not restart tutorials', variant: 'destructive' })));
  expect(screen.getByTestId('button-restart-tutorials')).toBeVisible();
});

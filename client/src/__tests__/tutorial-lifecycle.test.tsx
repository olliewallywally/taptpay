import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TutorialPageBoundary, TutorialProvider } from '@/features/tutorial/tutorial';
import { apiRequest } from '@/lib/queryClient';

let mockLocation = '/trades';
let mockDevice: 'mobile' | 'tablet' | 'desktop' = 'mobile';
jest.mock('wouter', () => ({ useLocation: () => [mockLocation, jest.fn()] }));
jest.mock('@/hooks/use-device-class', () => ({ useDeviceClass: () => mockDevice }));
jest.mock('@/lib/queryClient', () => ({ apiRequest: jest.fn() }));
jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    AnimatePresence: ({ children }: any) => children,
    useReducedMotion: () => true,
    motion: { div: React.forwardRef(({ initial, animate, exit, transition, ...props }: any, ref: any) => <div {...props} ref={ref} />) },
  };
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => ({ generation: 1, autoEnabled: true, pageCount: 20, progress: {} }) } } });
  const tree = (mounted: boolean) => <QueryClientProvider client={client}><TutorialProvider enabled>{mounted && <TutorialPageBoundary pageKey="trades-dashboard"><div>Trades page</div></TutorialPageBoundary>}</TutorialProvider></QueryClientProvider>;
  return { client, tree };
}

beforeEach(() => {
  mockLocation = '/trades'; mockDevice = 'mobile';
  jest.mocked(apiRequest).mockReset().mockImplementation(async (_method, _url, body: any) => ({ json: async () => ({ status: body.status, lastStep: body.lastStep }) }) as Response);
});

test('a responsive layout unmount does not dismiss the active tutorial on the same route', async () => {
  const { client, tree } = setup();
  const view = render(tree(true));
  await screen.findByRole('dialog');
  view.rerender(tree(false));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  mockDevice = 'tablet';
  view.rerender(tree(true));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(jest.mocked(apiRequest).mock.calls.some((call) => (call[2] as any)?.status === 'dismissed')).toBe(false);
  view.unmount(); client.clear();
});

test('a same-route layout gap before the startup delay does not strand the tutorial', async () => {
  const { client, tree } = setup();
  const view = render(tree(true));
  try {
    await waitFor(() => expect(client.getQueryData(['/api/tutorial/state'])).toBeDefined());
    view.rerender(tree(false));
    view.rerender(tree(true));
    await screen.findByRole('dialog');
  } finally { view.unmount(); client.clear(); }
});

test.each([true, false])('a pending first progress write activates only on the original route (same route: %s)', async (sameRoute) => {
  let resume!: (reply: Response) => void;
  jest.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
  const { client, tree } = setup();
  const view = render(tree(true));
  try {
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    view.rerender(tree(false));
    if (!sameRoute) mockLocation = '/stock';
    view.rerender(tree(true));
    await act(async () => { resume({ json: async () => ({ status: 'started', lastStep: 0 }) } as Response); });
    if (sameRoute) await screen.findByRole('dialog');
    else expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  } finally { view.unmount(); client.clear(); }
});

test('changing the actual route dismisses and persists the old tutorial even during a layout gap', async () => {
  const { client, tree } = setup();
  const view = render(tree(true));
  await screen.findByRole('dialog');
  mockLocation = '/stock';
  view.rerender(tree(false));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(jest.mocked(apiRequest).mock.calls.some((call) => (call[2] as any)?.status === 'dismissed')).toBe(true);
  view.unmount(); client.clear();
});

test('moving from a desktop-only last step to mobile keeps a finishable tutorial', async () => {
  mockDevice = 'desktop';
  const { client, tree } = setup();
  const view = render(tree(true));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Next tutorial step' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next tutorial step' }));
  expect(screen.getByText('3 of 3')).toBeInTheDocument();
  mockDevice = 'mobile';
  view.rerender(tree(true));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finish tutorial' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(jest.mocked(apiRequest).mock.calls.some((call) => (call[2] as any)?.status === 'completed' && (call[2] as any)?.lastStep === 1)).toBe(true);
  view.unmount(); client.clear();
});

test('an inert primary target uses the visible fallback and rebinds when the primary opens', async () => {
  const rectangle = { x: 20, y: 20, left: 20, top: 20, right: 120, bottom: 60, width: 100, height: 40, toJSON() {} };
  const boxes = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.matches('.td-card') ? { ...rectangle, left: 200, right: 300 } : rectangle;
  });
  const { client } = setup();
  const view = render(<QueryClientProvider client={client}><TutorialProvider enabled><TutorialPageBoundary pageKey="trades-dashboard">
    <div data-testid="hidden-group" {...{ inert: '' } as Record<string, string>}><div data-tutorial-id="trades-home-health" /></div><div className="td-card" />
  </TutorialPageBoundary></TutorialProvider></QueryClientProvider>);
  await screen.findByRole('dialog');
  const primary = document.querySelector('[data-tutorial-id="trades-home-health"]') as HTMLElement;
  const primaryScroll = jest.fn();
  Object.defineProperty(primary, 'scrollIntoView', { value: primaryScroll, configurable: true });
  await act(async () => { window.dispatchEvent(new Event('resize')); });
  await waitFor(() => expect((document.querySelector('.tutorial-highlight') as HTMLElement).style.left).toBe('191px'));
  expect(primaryScroll).not.toHaveBeenCalled();
  await act(async () => { screen.getByTestId('hidden-group').removeAttribute('inert'); });
  await waitFor(() => expect((document.querySelector('.tutorial-highlight') as HTMLElement).style.left).toBe('11px'));
  view.unmount(); client.clear(); boxes.mockRestore();
});

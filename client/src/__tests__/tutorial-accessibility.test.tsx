import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TutorialPageBoundary, TutorialProvider } from '@/features/tutorial/tutorial';
import { apiRequest } from '@/lib/queryClient';

let mockLocation = '/trades';
jest.mock('wouter', () => ({ useLocation: () => [mockLocation, jest.fn()] }));
jest.mock('@/hooks/use-device-class', () => ({ useDeviceClass: () => 'mobile' }));
jest.mock('@/lib/queryClient', () => ({ apiRequest: jest.fn() }));
jest.mock('framer-motion', () => {
  const React = require('react');
  return { AnimatePresence: ({ children }: any) => children, useReducedMotion: () => true,
    motion: { div: React.forwardRef(({ initial, animate, exit, transition, ...props }: any, ref: any) => <div {...props} ref={ref} />) } };
});

beforeEach(() => {
  mockLocation = '/trades';
  jest.mocked(apiRequest).mockReset().mockImplementation(async (_method, _url, body: any) => ({ json: async () => ({ status: body.status, lastStep: body.lastStep }) }) as Response);
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0,
    queryFn: async () => ({ generation: 1, autoEnabled: true, pageCount: 20, progress: {} }) } } });
  const tree = () => <QueryClientProvider client={client}><TutorialProvider enabled>
    <TutorialPageBoundary pageKey="trades-dashboard"><button>Overview action</button><button>Destination action</button></TutorialPageBoundary>
  </TutorialProvider></QueryClientProvider>;
  const view = render(tree());
  const origin = screen.getByRole('button', { name: 'Overview action' });
  origin.focus();
  return { client, view, tree, origin, close: () => { view.unmount(); client.clear(); } };
}

test('Escape returns keyboard focus to the control active before the tutorial', async () => {
  const fixture = setup();
  try {
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: 'Next tutorial step' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fixture.origin).toHaveFocus();
  } finally { fixture.close(); }
});

test('completion restores the original control after multiple tutorial steps', async () => {
  const fixture = setup();
  try {
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Next tutorial step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish tutorial' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fixture.origin).toHaveFocus();
  } finally { fixture.close(); }
});

test('Tab and Shift-Tab wrap inside the named tutorial dialog', async () => {
  const fixture = setup();
  try {
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('See revenue and active work');
    const close = screen.getByRole('button', { name: 'Exit Trades dashboard tutorial' });
    const next = screen.getByRole('button', { name: 'Next tutorial step' });
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(next).toHaveFocus();
  } finally { fixture.close(); }
});

test('leaving the tutorial route does not restore focus to the previous page control', async () => {
  const fixture = setup();
  try {
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next tutorial step' })).toHaveFocus());
    mockLocation = '/stock'; fixture.view.rerender(fixture.tree());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fixture.origin.isConnected).toBe(true);
    expect(fixture.origin).not.toHaveFocus();
  } finally { fixture.close(); }
});

import { render, screen, fireEvent } from '@testing-library/react';
import { AnimatedScrollList } from './AnimatedScrollList';

test('a non-interactive overflow list exposes a named keyboard focus target on the scrolling element', () => {
  render(<AnimatedScrollList tabIndex={0} role="region" aria-label="Rent requests" className="actual-scroll" showGradients={false}>
    <p>Read-only request</p>
  </AnimatedScrollList>);
  const region = screen.getByRole('region', { name: 'Rent requests' });
  region.focus();
  expect(region).toHaveFocus();
  expect(region).toHaveClass('actual-scroll');
});

test('named container focus preserves arrow navigation between list controls', () => {
  render(<AnimatedScrollList tabIndex={0} role="region" aria-label="Clients" showGradients={false}>
    <button data-scroll-nav-item>First client</button><button data-scroll-nav-item>Second client</button>
  </AnimatedScrollList>);
  const region = screen.getByRole('region', { name: 'Clients' });
  // JSDOM has no layout/scroll implementation; real scroll geometry is verified
  // by the browser matrix. Keep the component's existing scroll call observable.
  const first = screen.getByRole('button', { name: 'First client' });
  const second = screen.getByRole('button', { name: 'Second client' });
  first.scrollIntoView = jest.fn(); second.scrollIntoView = jest.fn();
  region.focus();
  fireEvent.keyDown(region, { key: 'ArrowDown' });
  expect(screen.getByRole('button', { name: 'First client' })).toHaveFocus();
  fireEvent.keyDown(region, { key: 'ArrowDown' });
  expect(screen.getByRole('button', { name: 'Second client' })).toHaveFocus();
  expect(first.scrollIntoView).toHaveBeenCalled();
  expect(second.scrollIntoView).toHaveBeenCalled();
});

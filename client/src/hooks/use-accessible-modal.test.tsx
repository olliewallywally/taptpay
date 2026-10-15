import { fireEvent, render, screen } from '@testing-library/react';
import { useAccessibleModal } from './use-accessible-modal';

function Fixture({ open, close }: { open: boolean; close: () => void }) {
  const ref = useAccessibleModal(open, close);
  return <><button>Origin</button><aside aria-hidden="false">Background</aside>{open && <div ref={ref} role="dialog" aria-label="Form" tabIndex={-1}><button>First</button><button>Last</button></div>}</>;
}

test('modal traps both Tab boundaries, contains focus and restores prior background state and origin', () => {
  const close = jest.fn(), view = render(<Fixture open={false} close={close} />);
  const origin = screen.getByRole('button', { name: 'Origin' }); origin.focus();
  view.rerender(<Fixture open close={close} />);
  const first = screen.getByRole('button', { name: 'First' }), last = screen.getByRole('button', { name: 'Last' });
  expect(first).toHaveFocus();
  expect(origin.inert).toBe(true);
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus();
  origin.focus(); expect(first).toHaveFocus();
  view.rerender(<Fixture open={false} close={close} />);
  expect(origin).toHaveFocus(); expect(origin.inert).toBeFalsy();
  expect(screen.getByText('Background')).toHaveAttribute('aria-hidden', 'false');
});

test('Escape invokes the current close contract once without changing busy state itself', () => {
  const old = jest.fn(), current = jest.fn(), view = render(<Fixture open close={old} />);
  view.rerender(<Fixture open close={current} />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), { key: 'Escape' });
  expect(old).not.toHaveBeenCalled(); expect(current).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('route departure does not restore focus into the departed page', () => {
  const view = render(<Fixture open={false} close={() => {}} />);
  const origin = screen.getByRole('button', { name: 'Origin' }); origin.focus();
  view.rerender(<Fixture open close={() => {}} />);
  window.history.replaceState(null, '', '/next');
  view.rerender(<Fixture open={false} close={() => {}} />);
  expect(origin).not.toHaveFocus();
  window.history.replaceState(null, '', '/');
});

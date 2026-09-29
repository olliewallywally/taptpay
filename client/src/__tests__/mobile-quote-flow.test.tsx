import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MobileQuoteView, type MobileQuoteViewProps } from '@/features/terminal/trades/MobileQuoteView';
import { createQuoteSchema } from '@shared/schema';

const create = jest.fn();
const skip = jest.fn();
function Harness({ created = null }: { created?: any }) {
  const [recipient, onRecipientChange] = useState({ name: '', email: '', address: '' });
  const [clientId, onClientIdChange] = useState('');
  const [lines, setLines] = useState([{ id: 1, description: '', qty: '1', unitPrice: '' }]);
  const [depositEnabled, onDepositEnabledChange] = useState(false);
  const [depositType, onDepositTypeChange] = useState<'percent' | 'fixed'>('percent');
  const [depositValue, onDepositValueChange] = useState('20');
  const [notes, onNotesChange] = useState('');
  const p: MobileQuoteViewProps = { clients: [{ id: 'c1', firstName: 'A', lastName: 'Client', status: 'active' }], clientId, onClientIdChange, recipient, onRecipientChange, lines, onLineChange: (id, field, value) => setLines(ls => ls.map(l => l.id === id ? { ...l, [field]: value } : l)), onRemoveLine: () => {}, onAddLine: () => {}, depositEnabled, onDepositEnabledChange, depositType, onDepositTypeChange, depositValue, onDepositValueChange, notes, onNotesChange, created, error: '', gstRegistered: false, gstMode: 'inclusive', totals: { total: Number(lines[0].unitPrice) * 100, net: 0, gst: 0, deposit: 0 }, publicUrl: 'https://example.test/trades/quote/token', isCreating: false, onCreate: create, onCopyLink: jest.fn(), onShare: jest.fn(), onDownloadPdf: jest.fn(), onCancel: jest.fn(), onExit: jest.fn(), onSkipClient: skip };
  return <MobileQuoteView {...p} />;
}

beforeEach(() => jest.clearAllMocks());
test('start, skip, validate items, back, deposit presets and create only on final step', () => {
  render(<Harness />);
  expect(screen.queryByLabelText('Choose client')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Build quote' }));
  fireEvent.click(screen.getByRole('button', { name: 'skip' }));
  expect(skip).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Complete each item');
  fireEvent.change(screen.getByLabelText('Item 1 description'), { target: { value: 'Repair' } });
  fireEvent.change(screen.getByLabelText('Item 1 unit price'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('Item 1 description')).toHaveValue('Repair');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.queryByRole('button', { name: '10%' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'require deposit' }));
  fireEvent.click(screen.getByRole('button', { name: '10%' }));
  expect(screen.getByRole('button', { name: '10%' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'custom' }));
  fireEvent.change(screen.getByLabelText('Deposit value'), { target: { value: '101' } });
  fireEvent.click(screen.getByRole('button', { name: 'create quote' }));
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '20%' }));
  fireEvent.click(screen.getByRole('button', { name: 'create quote' }));
  expect(create).toHaveBeenCalledTimes(1);
});
test('saved client bypasses inline required fields; entered details survive back', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Build quote' }));
  fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Sam' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('name')).toHaveValue('Sam');
  fireEvent.click(screen.getByRole('button', { name: 'Choose client' }));
  fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'A Client' } });
  fireEvent.click(screen.getByRole('button', { name: 'A Client' }));
  expect(screen.queryByLabelText('name')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByLabelText('Item 1 description')).toBeInTheDocument();
});
test('success exposes sharing, copy, and selectable real link', () => {
  render(<Harness created={{ token: 'token', delivered: false }} />);
  expect(screen.getByRole('button', { name: 'share' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'copy link' })).toBeInTheDocument();
  expect(screen.getByLabelText('Quote link')).toHaveValue('https://example.test/trades/quote/token');
  expect(screen.queryByRole('button', { name: 'create quote' })).toBeNull();
});
const base = { lineItems: [{ description: 'Repair', qty: 1, unitPriceCents: 10000, lineTotalCents: 10000 }] };
test('quote API schema accepts exactly one client mode and validates inline details', () => {
  const clientProfileId = '11111111-1111-4111-8111-111111111111';
  for (const mode of [{ clientProfileId }, { recipient: { name: 'Sam', email: 'sam@example.test', address: '1 Road' } }, { skipClient: true }]) expect(createQuoteSchema.safeParse({ ...base, ...mode }).success).toBe(true);
  for (const mode of [{}, { skipClient: false }, { clientProfileId, skipClient: true }, { recipient: { name: '' } }, { recipient: { name: 'Sam', email: 'bad' } }, { recipient: { name: 'Sam' }, skipClient: true }]) expect(createQuoteSchema.safeParse({ ...base, ...mode }).success).toBe(false);
});

test('inline directory searches, collapses with Escape and keeps manual details', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Build quote' }));
  const trigger = screen.getByRole('button', { name: 'Choose client' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: 'Client directory' })).toBeNull();
  fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Sam' } });
  fireEvent.click(trigger);
  expect(screen.getByRole('region', { name: 'Client directory' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'missing' } });
  expect(screen.getByText('no clients found')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByLabelText('Search clients'), { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
  expect(screen.getByLabelText('name')).toHaveValue('Sam');
  expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('mq-back');
});

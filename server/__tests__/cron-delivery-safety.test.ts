import './support/test-env';
import { CronStopped, withCronCheckpoint } from '../cron-checkpoint';
const mockStorage = {
  getPendingDispatchInvoices: jest.fn(),
  getPendingDispatchJobInvoices: jest.fn(),
  getSubscription: jest.fn(),
  getMerchant: jest.fn(),
  getTenantProfile: jest.fn(),
  getClientProfile: jest.fn(),
  getJobInvoice: jest.fn(),
  updateInvoiceRentRequest: jest.fn(),
  logTransactionEvent: jest.fn(),
  updateJobInvoice: jest.fn(),
  createJobEvent: jest.fn(),
};
const mockWhatsApp = jest.fn(),
  mockEmail = jest.fn();
jest.mock('../storage', () => ({ storage: mockStorage }));
jest.mock('../email-service', () => ({
  sendEmail: (...args: unknown[]) => mockEmail(...args),
}));
jest.mock('../whatsapp-service', () => ({
  isWhatsAppConfigured: () => true,
  sendWhatsApp: (...args: unknown[]) => mockWhatsApp(...args),
}));
jest.mock('../sms-service', () => ({
  isSmsConfigured: () => false,
  sendSms: jest.fn(),
}));
import { runDispatchPass } from '../property-cron';
import { runTradesDispatchPass } from '../trades-delivery';
const invoice = {
  id: '12345678-1234-4234-9234-123456789012',
  merchantId: 1,
  tenantProfileId: 'parent',
  clientProfileId: 'parent',
  amountCents: 100,
  status: 'pending_dispatch',
  deliveryChannel: 'whatsapp',
  token: 'synthetic-link',
  dueAt: new Date(),
};
beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.getPendingDispatchInvoices.mockResolvedValue([invoice]);
  mockStorage.getPendingDispatchJobInvoices.mockResolvedValue([invoice]);
  mockStorage.getSubscription.mockResolvedValue({
    status: 'active',
    lastBillingDate: '2026-10-01',
    currentPeriodEnd: new Date('2099-01-01'),
  });
  mockStorage.getMerchant.mockResolvedValue({ name: 'Synthetic' });
  mockStorage.getTenantProfile.mockResolvedValue({
    firstName: 'Synthetic',
    lastName: 'Fixture',
    email: 'fixture@synthetic.test',
    phone: 'synthetic-phone',
    propertyAddress: 'Synthetic',
  });
  mockStorage.getClientProfile.mockResolvedValue({
    firstName: 'Synthetic',
    email: 'fixture@synthetic.test',
    phone: 'synthetic-phone',
    siteAddress: 'Synthetic',
  });
  mockStorage.getJobInvoice.mockResolvedValue(invoice);
  mockWhatsApp.mockResolvedValue({ ok: false });
  mockEmail.mockResolvedValue(true);
  mockStorage.updateInvoiceRentRequest.mockImplementation(
    async (_id, updates) => ({ ...invoice, ...updates })
  );
  mockStorage.updateJobInvoice.mockImplementation(async (_id, updates) => ({
    ...invoice,
    ...updates,
  }));
});
test.each([
  ['property', runDispatchPass],
  ['trades', runTradesDispatchPass],
] as const)(
  '%s uncertain send is reported for a hold and never falls through to another provider',
  async (_name, run) => {
    const result = await withCronCheckpoint(
      () => {},
      () => run('https://synthetic.test')
    );
    expect((result as any).uncertain).toBe(1);
    expect(mockWhatsApp).toHaveBeenCalledTimes(1);
    expect(mockEmail).not.toHaveBeenCalled();
    expect(mockStorage.updateInvoiceRentRequest).not.toHaveBeenCalled();
    expect(mockStorage.updateJobInvoice).not.toHaveBeenCalled();
  }
);
test.each([
  ['property', runDispatchPass],
  ['trades', runTradesDispatchPass],
] as const)(
  '%s late provider result cannot write success or send the next record after ownership is lost',
  async (_name, run) => {
    let stopped = false;
    mockStorage.getPendingDispatchInvoices.mockResolvedValue([
      invoice,
      { ...invoice, id: 'second' },
    ]);
    mockStorage.getPendingDispatchJobInvoices.mockResolvedValue([
      invoice,
      { ...invoice, id: 'second' },
    ]);
    mockWhatsApp.mockImplementation(async () => {
      stopped = true;
      return { ok: true };
    });
    const check = () => {
      if (stopped) throw new CronStopped();
    };
    await expect(
      withCronCheckpoint(check, () => run('https://synthetic.test'))
    ).rejects.toBeInstanceOf(CronStopped);
    expect(mockWhatsApp).toHaveBeenCalledTimes(1);
    expect(mockStorage.updateInvoiceRentRequest).not.toHaveBeenCalled();
    expect(mockStorage.updateJobInvoice).not.toHaveBeenCalled();
  }
);
test('property pre-send billing ineligibility is not mislabeled as an uncertain provider send', async () => {
  mockStorage.getSubscription.mockResolvedValue(undefined);
  const result = await withCronCheckpoint(
    () => {},
    () => runDispatchPass('https://synthetic.test')
  );
  expect(result.failed).toBe(1);
  expect((result as any).uncertain ?? 0).toBe(0);
  expect(mockWhatsApp).not.toHaveBeenCalled();
  expect(mockEmail).not.toHaveBeenCalled();
});

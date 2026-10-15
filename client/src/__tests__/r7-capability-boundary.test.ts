import { canTapToPay, isNativeIOS } from '../lib/native';
afterEach(() => {
  delete (window as any).Capacitor;
  delete (window as any).TaptPay;
});
test('a native iOS proxy cannot advertise an unimplemented payment capability', () => {
  (window as any).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
  };
  (window as any).TaptPay = { startTapToPay: jest.fn() };
  expect(isNativeIOS()).toBe(true); // Keep real native push/platform detection.
  expect(canTapToPay()).toBe(false);
  expect((window as any).TaptPay.startTapToPay).not.toHaveBeenCalled();
});
test('web and missing bridge stay unavailable', () =>
  expect(canTapToPay()).toBe(false));

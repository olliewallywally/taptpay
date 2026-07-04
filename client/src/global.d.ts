// Centralised Window augmentation. Declared once and consistently here (and
// ONLY here) — multiple per-file `declare global` blocks with differing
// optional/required modifiers trigger TS2687.
export {};

declare global {
  interface Window {
    WindcavePayments?: any;
    ApplePaySession?: any;
    google?: any;
    PaymentRequest?: any;
    webkitAudioContext?: typeof AudioContext;
  }
}

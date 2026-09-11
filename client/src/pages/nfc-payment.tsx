import { Waves } from "lucide-react";

/**
 * R0-T5 retires the NFC simulator consumer.
 *
 * This page used to drive `/api/nfc-sessions/:id/complete`, which fabricated a
 * successful payment with no provider involved. That route is gone from the
 * production router, so the flow it drove cannot complete — and the plan's rule
 * 5 is that deleting fake implementations is the fix, not flagging them. What
 * remains is a truthful unavailable state at the same route, so a merchant who
 * has the page bookmarked is told plainly rather than meeting a broken flow.
 *
 * Tap to Pay reality lives behind FEATURE_TAP_TO_PAY and R7's hardware gate.
 */
export default function NFCPayment() {
  return (
    <div className="min-h-screen relative overflow-hidden" data-testid="nfc-retired">
      <div className="fixed inset-0 bg-gradient-to-br from-black via-gray-900 to-gray-800" />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-8">
        <div
          data-tutorial-id="nfc-unavailable"
          className="bg-white/5 border border-white/10 rounded-3xl p-10 max-w-md w-full text-center backdrop-blur-xl"
        >
          <Waves className="w-10 h-10 text-white/50 mx-auto mb-6" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-white mb-3">Tap to pay is not available</h1>
          <p data-tutorial-id="nfc-alternative" className="text-sm text-white/60">
            This terminal cannot take contactless payments yet. Use a QR code payment instead.
          </p>
        </div>
      </div>
    </div>
  );
}

import Foundation
import Capacitor

// MARK: - TapToPayPlugin
//
// Capacitor bridge for Windcave Tap to Pay on iPhone (iOS 16.4+, iPhone XS and later).
//
// INTEGRATION STEPS
// ─────────────────
// 1. Add the Windcave iOS SDK (WCPaymentSDK) to your Xcode project via Swift Package Manager
//    or CocoaPods:
//      pod 'WCPaymentSDK'
//
// 2. Add the required entitlements to your target:
//      com.apple.developer.proximity-reader.payment.acceptance = true
//
// 3. Enable Tap to Pay capability in Xcode → Signing & Capabilities → + Tap to Pay on iPhone.
//
// 4. Uncomment the WCPaymentSDK import and implementation below when the SDK is installed.
//
// 5. The JavaScript side calls:
//      await window.TaptPay.startTapToPay({ amount, currency, merchantName })
//    and receives:
//      { approved: boolean, token?: string, cancelled?: boolean, error?: string }
//
// 6. On success the JS layer posts { merchantId, amount, windcaveToken: token, itemName }
//    to POST /api/transactions/tap-to-pay where the server submits the token to Windcave.

@objc(TapToPayPlugin)
public class TapToPayPlugin: CAPPlugin {

    // MARK: startTapToPay

    @objc func startTapToPay(_ call: CAPPluginCall) {
        guard let amount = call.getDouble("amount"),
              let currency = call.getString("currency"),
              let merchantName = call.getString("merchantName") else {
            call.reject("amount, currency and merchantName are required")
            return
        }

        // ── Windcave SDK integration (uncomment when WCPaymentSDK is available) ───────
        //
        // import WCPaymentSDK
        //
        // let config = WCPaymentConfig(
        //     amount: NSDecimalNumber(value: amount),
        //     currency: currency,
        //     merchantName: merchantName
        // )
        //
        // WCPaymentSDK.shared.startTapToPaySession(config: config) { result in
        //     switch result {
        //     case .success(let paymentResult):
        //         if paymentResult.authorised {
        //             call.resolve([
        //                 "approved": true,
        //                 "token": paymentResult.token ?? ""
        //             ])
        //         } else {
        //             call.resolve(["approved": false])
        //         }
        //     case .cancelled:
        //         call.resolve(["approved": false, "cancelled": true])
        //     case .failure(let error):
        //         call.resolve(["approved": false, "error": error.localizedDescription])
        //     }
        // }
        // ─────────────────────────────────────────────────────────────────────────────

        // Stub — remove this block once WCPaymentSDK is integrated
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            call.resolve([
                "approved": true,
                "token": "STUB_TOKEN_\(Int(Date().timeIntervalSince1970))"
            ])
        }
    }
}

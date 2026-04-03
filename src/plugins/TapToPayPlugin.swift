import Foundation
import Capacitor

// MARK: - TapToPayPlugin
//
// Capacitor bridge for Windcave Tap to Pay on iPhone (iOS 16.4+, iPhone XS and later).
// Surfaced to JavaScript as window.TaptPay via Capacitor's plugin system.
//
// JS CONTRACT
// ───────────
//   await window.TaptPay.startTapToPay({ amount, currency, merchantName })
//   → { approved: boolean, token?: string, cancelled?: boolean, error?: string }
//
// The JS shim in client/src/plugins/TaptPayPlugin.ts calls registerPlugin('TaptPay')
// which Capacitor maps to this class through jsName = "TaptPay" below.
//
// INTEGRATION STEPS
// ─────────────────
// 1. Add the Windcave iOS SDK (WCPaymentSDK) via Swift Package Manager or CocoaPods:
//      pod 'WCPaymentSDK'
//
// 2. Add the required entitlements to your target:
//      com.apple.developer.proximity-reader.payment.acceptance = true
//
// 3. Enable Tap to Pay capability in Xcode → Signing & Capabilities → + Tap to Pay on iPhone.
//
// 4. Uncomment the WCPaymentSDK import and implementation below when the SDK is installed.
//
// 5. On success the JS layer posts { merchantId, transactionId, amount, windcaveToken: token }
//    to POST /api/transactions/tap-to-pay. The server creates an attended Windcave session,
//    submits the token, and finalises the pending transaction.

@objc(TapToPayPlugin)
public class TapToPayPlugin: CAPPlugin, CAPBridgedPlugin {

    // MARK: - Capacitor bridge registration
    //
    // These three properties are required by the CAPBridgedPlugin protocol.
    // They wire this Swift class to the JavaScript name "TaptPay" so that
    //   registerPlugin('TaptPay')  in client/src/plugins/TaptPayPlugin.ts
    // and
    //   window.TaptPay.startTapToPay(...)
    // both resolve to this plugin.

    public let identifier = "TapToPayPlugin"   // must match @objc(TapToPayPlugin)
    public let jsName = "TaptPay"              // must match registerPlugin('TaptPay')
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startTapToPay", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - startTapToPay

    @objc func startTapToPay(_ call: CAPPluginCall) {
        guard let amount = call.getDouble("amount"),
              let currency = call.getString("currency"),
              let merchantName = call.getString("merchantName") else {
            call.reject("amount, currency and merchantName are required")
            return
        }

        // ── Windcave WCPaymentSDK integration (uncomment when SDK is available) ───────
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

        // Stub — simulates an approved NFC tap after 1.5 s.
        // Replace with the WCPaymentSDK block above once the SDK is installed.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            call.resolve([
                "approved": true,
                "token": "STUB_TOKEN_\(Int(Date().timeIntervalSince1970))"
            ])
        }
    }
}

import { useParams, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import taptLogo from "@assets/IMG_6592_1755070818452.png";

export default function PaymentResult() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const params = new URLSearchParams(search);
  const status = params.get("status") || "unknown";
  const txnId = parseInt(transactionId);

  const { data: transaction } = useQuery({
    queryKey: ["/api/transactions", txnId],
    queryFn: async () => {
      const response = await fetch(`/api/transactions/${txnId}`);
      if (!response.ok) throw new Error("Transaction not found");
      return response.json();
    },
    enabled: !!txnId && !isNaN(txnId),
  });

  const { data: merchant } = useQuery({
    queryKey: ["/api/merchants", transaction?.merchantId],
    queryFn: async () => {
      const response = await fetch(`/api/merchants/${transaction.merchantId}`);
      if (!response.ok) throw new Error("Merchant not found");
      return response.json();
    },
    enabled: !!transaction?.merchantId,
  });

  const amount = transaction ? `$${parseFloat(transaction.price).toFixed(2)}` : "";
  const itemName = transaction?.itemName || "";
  const merchantName = merchant?.businessName || "the merchant";
  const paymentUrl = transaction?.merchantId
    ? transaction.taptStoneId
      ? `/pay/${transaction.merchantId}/stone/${transaction.taptStoneId}`
      : `/pay/${transaction.merchantId}`
    : "/";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm md:max-w-md">
        <div className="rounded-[48px] overflow-hidden shadow-2xl">
          {/* Blue section */}
          <div
            className={`px-8 pt-8 pb-24 rounded-b-[48px] relative z-10 ${
              status === "approved"
                ? "bg-[#0055FF]"
                : status === "declined"
                ? "bg-[#CC0022]"
                : "bg-gray-700"
            }`}
          >
            {/* Logo */}
            <div className="text-center mb-8">
              <img
                src={merchant?.customLogoUrl || taptLogo}
                alt="logo"
                className="h-12 mx-auto object-contain"
                style={
                  merchant?.customLogoUrl
                    ? {}
                    : {
                        filter:
                          "brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)",
                      }
                }
              />
            </div>

            {/* Approved */}
            {status === "approved" && (
              <div className="text-center">
                <CheckCircle className="w-20 h-20 text-[#00E5CC] mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-white mb-2">Payment Successful!</h1>
                <p className="text-[#00E5CC] text-4xl font-bold mt-4">{amount}</p>
                <p className="text-white/70 text-sm mt-2">{itemName}</p>
                <p className="text-white/60 text-sm mt-1">Thank you for your purchase</p>
              </div>
            )}

            {/* Declined */}
            {status === "declined" && (
              <div className="text-center">
                <XCircle className="w-20 h-20 text-white mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-white mb-2">Payment Declined</h1>
                <p className="text-white/80 text-base mt-3">
                  Your payment could not be processed.
                </p>
                <p className="text-white/60 text-sm mt-2">
                  Please check your card details or try another payment method.
                </p>
              </div>
            )}

            {/* Cancelled */}
            {status === "cancelled" && (
              <div className="text-center">
                <AlertCircle className="w-20 h-20 text-white mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-white mb-2">Payment Cancelled</h1>
                <p className="text-white/70 text-base mt-3">
                  You cancelled the payment.
                </p>
              </div>
            )}

            {/* Unknown */}
            {status !== "approved" && status !== "declined" && status !== "cancelled" && (
              <div className="text-center">
                <AlertCircle className="w-20 h-20 text-white/60 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-white mb-2">Payment Status Unknown</h1>
                <p className="text-white/60 text-sm">Please check with staff.</p>
              </div>
            )}
          </div>

          {/* Bottom section */}
          <div
            className={`px-8 relative z-0 ${
              status === "approved" ? "bg-[#00E5CC]" : "bg-gray-200"
            }`}
            style={{ paddingTop: "4rem", paddingBottom: "2rem", marginTop: "-4rem" }}
          >
            {status === "approved" ? (
              <div className="text-center">
                <p className="text-[#0055FF] font-semibold text-sm">Powered by TaptPay</p>
              </div>
            ) : (
              <Button
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white rounded-[20px] py-6 text-lg font-medium"
                onClick={() => setLocation(paymentUrl)}
                data-testid="button-try-again"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

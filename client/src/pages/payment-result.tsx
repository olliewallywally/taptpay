import { useParams, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { CheckCircle, XCircle, AlertCircle, ArrowLeft, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import taptLogo from "@assets/IMG_6592_1755070818452.png";
import { TRANSACTIONS_KEY, apiPath } from "@shared/api-path";
import {useTokenPagePrivacy} from '@/hooks/use-token-page-privacy';

export default function PaymentResult() {
  useTokenPagePrivacy();
  const { transactionId } = useParams<{ transactionId: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const params = new URLSearchParams(search);
  const state = params.get("state");
  const txnId = /^[1-9]\d*$/.test(transactionId??'') ? Number(transactionId) : NaN;
  const {data: confirmation} = useQuery({
    queryKey:['payment-return',state],
    queryFn:async()=>{
      const response=await fetch(apiPath('GET /api/pay/return/:state',{state:state!}));
      if(!response.ok)throw new Error('Payment confirmation unavailable');
      return response.json();
    },
    enabled:!!state && /^[A-Za-z0-9_-]{43}$/.test(state),
    refetchInterval:query=>['approved','declined','cancelled'].includes(query.state.data?.outcome) ? false : 1500,
  });
  const status = confirmation?.transactionId===txnId && ['approved','declined','cancelled'].includes(confirmation?.outcome)
    ? confirmation.outcome : 'processing';

  const { data: transaction } = useQuery({
    queryKey: [TRANSACTIONS_KEY, txnId],
    queryFn: async () => {
      const response = await fetch(apiPath("GET /api/transactions/:id", { id: txnId }));
      if (!response.ok) throw new Error("Transaction not found");
      return response.json();
    },
    enabled: !!txnId && !isNaN(txnId),
  });

  // The business's details come with the sale (owner decision 2026-09-26).
  const merchant = transaction?.merchant;

  const amount = transaction ? `$${parseFloat(transaction.price).toFixed(2)}` : "";
  const itemName = transaction?.itemName || "";
  const merchantName = merchant?.businessName || "the merchant";
  // A board sale's own board; the business-wide page is retired (2026-09-25).
  const paymentUrl = transaction?.merchantId && transaction.taptStoneId
    ? `/pay/${transaction.merchantId}/stone/${transaction.taptStoneId}`
    : "/";

  const splitId=Number.isInteger(confirmation?.receiptSplitId) && confirmation.receiptSplitId>0 ? confirmation.receiptSplitId : null;
  const receiptUrl = `/receipt/${txnId}${splitId?`?splitId=${splitId}`:''}`;
  const receiptReady=status==='approved' && (!confirmation?.receiptShare || !!splitId);

  // Auto-redirect to receipt after 2 seconds on approval
  useEffect(() => {
    if (!receiptReady || !txnId) return;
    const timer = setTimeout(() => setLocation(receiptUrl), 2000);
    return () => clearTimeout(timer);
  }, [receiptReady, txnId,receiptUrl,setLocation]);

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
                <h1 className="text-2xl font-bold text-white mb-2">Checking your payment</h1>
                <p className="text-white/60 text-sm" role="status">We’re confirming the result. Keep this page open and avoid paying again. Ask staff for help if this takes longer than expected.</p>
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
                <Button
                  className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white rounded-[20px] py-6 text-lg font-medium mb-3"
                  onClick={() => setLocation(receiptUrl)}
                  disabled={!receiptReady}
                >
                  <Receipt className="w-5 h-5 mr-2" />
                  View Receipt
                </Button>
                <p className="text-[#0055FF]/60 text-xs">Redirecting to receipt…</p>
              </div>
            ) : status!=='processing' ? (
              <Button
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white rounded-[20px] py-6 text-lg font-medium"
                onClick={() => setLocation(paymentUrl)}
                data-testid="button-try-again"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Try Again
              </Button>
            ) : <p className="text-center text-sm text-gray-700">Your payment is being confirmed.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

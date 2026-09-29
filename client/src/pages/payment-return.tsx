import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, XCircle } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { TaptWordmark } from "@/components/checkout/tapt-wordmark";
import { useTokenPagePrivacy } from "@/hooks/use-token-page-privacy";
import { cardStyle, CHECKOUT_THEME as CT, pageStyle } from "@/lib/checkout-theme";
import {
  forgetPaymentReturnState,
  paymentReturnDestination,
  paymentTokenForReturnState,
  type PaymentReturnOutcome,
} from "@/lib/payment-addressing";

function SafeReturnMessage({ loading = false }: { loading?: boolean }) {
  return (
    <div style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ ...cardStyle, minHeight: 420, justifyContent: "center" }}>
          <div style={{ position: "absolute", top: 44, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <TaptWordmark />
          </div>
          <div style={{ textAlign: "center" }}>
            {loading
              ? <Loader2 size={40} color={CT.SKY} style={{ margin: "0 auto", animation: "spin 1s linear infinite" }} />
              : <XCircle size={48} color={CT.RED} style={{ margin: "0 auto" }} />}
            <p style={{ color: CT.SKY, fontSize: 19, fontWeight: 700, margin: "16px 0 8px" }}>
              {loading ? "Confirming payment" : "Reopen the original payment link"}
            </p>
            <p style={{ color: CT.SKY_DIM, fontSize: 13, lineHeight: 1.5 }}>
              {loading ? "Please wait while we confirm the result…" : "For your security, this result can only be matched in the browser that started the payment."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentReturn() {
  const { state = "" } = useParams<{ state: string }>();
  const [, setLocation] = useLocation();
  const token = state ? paymentTokenForReturnState(state) : null;
  useTokenPagePrivacy();

  const { data, error } = useQuery<PaymentReturnOutcome>({
    queryKey: ["payment-return", state],
    queryFn: async () => {
      const response = await fetch(`/api/pay/return/${encodeURIComponent(state)}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) throw new Error("return-unavailable");
      return response.json();
    },
    enabled: !!state && !!token,
    retry: false,
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.outcome === "pending" ? 1200 : false,
  });

  useEffect(() => {
    if (!data || !token) return;
    const destination = paymentReturnDestination(data, token);
    if (!destination) return;
    forgetPaymentReturnState(state);
    setLocation(destination, { replace: true });
  }, [data, setLocation, state, token]);

  if (!state || !token || error) return <SafeReturnMessage />;
  return <SafeReturnMessage loading />;
}

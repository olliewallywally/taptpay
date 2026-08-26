import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { TaptWordmark } from "@/components/checkout/tapt-wordmark";
import { useTokenPagePrivacy } from "@/hooks/use-token-page-privacy";
import { cardStyle, CHECKOUT_THEME as CT, pageStyle } from "@/lib/checkout-theme";
import { checkoutResolveEndpoint, tokenEntryDestination } from "@/lib/payment-addressing";

type TokenPayment = {
  itemName: string;
  price: string;
  status: string;
  paymentMethod?: string | null;
  splitEnabled?: boolean | null;
  isSplit?: boolean | null;
  totalSplits?: number | null;
  completedSplits?: number | null;
  splitAmount?: string | null;
  createdAt?: string | null;
  merchant?: { customLogoUrl?: string | null };
  closed?: boolean;
};

async function resolveTokenPayment(token: string): Promise<TokenPayment> {
  const response = await fetch(checkoutResolveEndpoint({ kind: "retail-token", token }), {
    headers: { "Cache-Control": "no-cache" },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 410 && body?.payment) {
    return { ...body.payment, closed: true };
  }
  if (!response.ok) throw new Error(response.status === 404 ? "not-found" : "unavailable");
  return body;
}

function TokenMessage({
  icon,
  title,
  body,
  logo,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  logo?: string | null;
}) {
  return (
    <div style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ ...cardStyle, minHeight: 420, justifyContent: "center" }}>
          <div style={{ position: "absolute", top: 44, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <TaptWordmark customLogoUrl={logo} />
          </div>
          <div style={{ textAlign: "center" }}>
            {icon}
            <p style={{ color: CT.SKY, fontSize: 20, fontWeight: 700, margin: "14px 0 8px" }}>{title}</p>
            <p style={{ color: CT.SKY_DIM, fontSize: 14 }}>{body}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TokenPaymentEntry() {
  const { token = "" } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  useTokenPagePrivacy();

  const { data, isLoading, error } = useQuery<TokenPayment>({
    queryKey: ["token-payment", token],
    queryFn: () => resolveTokenPayment(token),
    enabled: !!token,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data || data.closed) return;
    if (["failed", "cancelled"].includes(data.status)) return;
    setLocation(tokenEntryDestination(data, token), { replace: true });
  }, [data, setLocation, token]);

  if (!token || error) {
    return <TokenMessage icon={<XCircle size={52} color={CT.RED} />} title="Payment link not found" body="This payment link doesn't exist or has expired." />;
  }
  if (data?.closed || ["failed", "cancelled"].includes(data?.status ?? "")) {
    return <TokenMessage icon={<XCircle size={52} color={CT.RED} />} title="Payment link closed" body="This payment can no longer be completed." logo={data?.merchant?.customLogoUrl} />;
  }
  if (isLoading || !data) {
    return <TokenMessage icon={<Loader2 size={38} color={CT.SKY} style={{ animation: "spin 1s linear infinite" }} />} title="Loading payment" body="Please wait a moment…" />;
  }
  return <TokenMessage icon={<CheckCircle size={52} color={CT.SKY} />} title="Opening payment" body="Your secure payment is ready." logo={data.merchant?.customLogoUrl} />;
}

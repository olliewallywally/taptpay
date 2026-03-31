import { useState } from "react";
import { useLocation } from "wouter";
import { Mail, RefreshCw, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@assets/IMG_6592_1755070818452.png";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  const stars = "*".repeat(Math.max(2, local.length - 2));
  return `${visible}${stars}@${domain}`;
}

export default function CheckEmail() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") || "";
  const id = params.get("id") || "";

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setResent(true);
        toast({ title: "Email sent", description: "Check your inbox again." });
      } else {
        const d = await res.json();
        toast({ title: "Failed to resend", description: d.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to resend", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "#0055ff", fontFamily: "Outfit, sans-serif" }}
    >
      <div className="w-full max-w-sm mb-4">
        <button
          onClick={() => setLocation("/signup")}
          className="text-white/50 hover:text-white text-xs uppercase tracking-widest flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> back
        </button>
      </div>

      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <img
            src={logoImage}
            alt="TaptPay"
            className="h-10 w-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </div>

        <div className="mx-auto w-16 h-16 rounded-full bg-[#00f1d7]/20 flex items-center justify-center mb-5">
          <Mail className="w-8 h-8 text-[#00f1d7]" />
        </div>

        <h1 className="text-white text-2xl font-semibold mb-2">Check your email</h1>
        <p className="text-white/60 text-sm leading-relaxed mb-2">
          We sent a confirmation link to
        </p>
        <p className="text-white font-medium text-sm mb-6">
          {email ? maskEmail(email) : "your email address"}
        </p>

        <div className="bg-white/10 rounded-2xl p-5 text-left mb-6 border border-white/15">
          <p className="text-white/80 text-sm leading-relaxed">
            Click the link in the email to confirm your address, then you'll be taken to the next step to complete your business details.
          </p>
        </div>

        <p className="text-white/40 text-xs mb-4">Didn't get it? Check your spam folder or</p>

        <button
          onClick={handleResend}
          disabled={resending || resent}
          className="w-full flex items-center justify-center gap-2 text-sm text-[#00f1d7] hover:text-white border border-[#00f1d7]/40 hover:border-white/40 rounded-2xl py-3 transition-colors disabled:opacity-50"
        >
          {resending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {resent ? "Email sent!" : resending ? "Sending..." : "Resend confirmation email"}
        </button>

        {id && (
          <p className="text-white/25 text-xs mt-8 leading-relaxed">
            Already confirmed?{" "}
            <button
              onClick={() => setLocation(`/business-details?id=${id}`)}
              className="text-[#00f1d7]/60 hover:text-[#00f1d7] underline"
            >
              Continue to business details
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

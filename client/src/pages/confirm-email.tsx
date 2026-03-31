import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import logoImage from "@assets/IMG_6592_1755070818452.png";

type State = "loading" | "success" | "error";

export default function ConfirmEmail() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<State>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setState("error");
      setErrorMsg("No verification token found in the link.");
      return;
    }

    fetch(`/api/auth/confirm-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setState("success");
          setTimeout(() => {
            setLocation(`/business-details?id=${data.merchantId}`);
          }, 2000);
        } else {
          setState("error");
          setErrorMsg(data.message || "Invalid or expired verification link.");
        }
      })
      .catch(() => {
        setState("error");
        setErrorMsg("Something went wrong. Please try again.");
      });
  }, [setLocation]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "#0055ff", fontFamily: "Outfit, sans-serif" }}
    >
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-8">
          <img
            src={logoImage}
            alt="TaptPay"
            className="h-10 w-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </div>

        {state === "loading" && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-5">
              <Loader2 className="w-8 h-8 text-[#00f1d7] animate-spin" />
            </div>
            <h1 className="text-white text-xl font-semibold mb-2">Confirming your email…</h1>
            <p className="text-white/50 text-sm">Just a moment.</p>
          </>
        )}

        {state === "success" && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-[#00f1d7]/20 flex items-center justify-center mb-5">
              <CheckCircle className="w-8 h-8 text-[#00f1d7]" />
            </div>
            <h1 className="text-white text-xl font-semibold mb-2">Email confirmed!</h1>
            <p className="text-white/60 text-sm leading-relaxed mb-6">
              Taking you to the next step…
            </p>
            <div className="flex justify-center">
              <div className="w-5 h-5 border-2 border-[#00f1d7] border-t-transparent rounded-full animate-spin" />
            </div>
          </>
        )}

        {state === "error" && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-5">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-white text-xl font-semibold mb-2">Verification failed</h1>
            <p className="text-white/60 text-sm leading-relaxed mb-6">{errorMsg}</p>
            <button
              onClick={() => setLocation("/signup")}
              className="w-full bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold py-3.5 rounded-2xl transition-colors"
            >
              Back to sign up
            </button>
          </>
        )}
      </div>
    </div>
  );
}

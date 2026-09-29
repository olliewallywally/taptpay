import { useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, XCircle } from "lucide-react";
import logoImage from "@assets/IMG_6592_1755070818452.png";

type State = "form" | "success" | "error";

// Owner decision 2026-09-23: the link alone no longer confirms an application. The page
// asks for the password chosen at sign-up, so an address's owner cannot be led to
// confirm an application a stranger started in their name.
export default function ConfirmEmail() {
  const [, setLocation] = useLocation();
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token"));
  const [state, setState] = useState<State>(token ? "form" : "error");
  const [errorMsg, setErrorMsg] = useState(token ? "" : "No verification token found in the link.");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [refused, setRefused] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) {
      setFormError("Enter the password you chose when you signed up.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("success");
        setTimeout(() => setLocation("/login"), 2000);
      } else if (data.code === "WRONG_PASSWORD" || res.status === 429) {
        setFormError(data.message || "That password didn't work. Please try again.");
        if (data.code === "WRONG_PASSWORD") setRefused(true);
      } else {
        setState("error");
        setErrorMsg(data.message || "Invalid or expired verification link.");
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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

        {state === "form" && (
          <form onSubmit={submit} className="text-left">
            <h1 className="text-white text-xl font-semibold mb-2 text-center">Confirm your email</h1>
            <p className="text-white/70 text-sm leading-relaxed mb-6 text-center">
              Enter the password you chose when you signed up, to show this application is yours.
            </p>
            <label htmlFor="confirm-password" className="block text-xs text-white/70 mb-1.5">
              Your password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm focus:outline-none focus:border-[#00f1d7]"
            />
            {formError && (
              <p role="alert" className="text-white text-sm leading-relaxed mt-3">{formError}</p>
            )}
            {refused && (
              // A reset link goes to this same address, so it proves the same thing, and it
              // replaces the password: a stranger's chosen one stops working.
              <p className="text-white/70 text-sm leading-relaxed mt-2">
                Forgotten it?{" "}
                <button
                  type="button"
                  onClick={() => setLocation("/forgot-password")}
                  className="underline text-white hover:text-[#00f1d7]"
                >
                  Reset your password
                </button>
                , then open the link in the confirmation email again.
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-5 bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold py-3.5 rounded-2xl transition-colors disabled:opacity-60"
            >
              {submitting ? "Confirming…" : "Confirm email"}
            </button>
            <p className="text-white/50 text-xs leading-relaxed mt-6 text-center">
              Didn't sign up for TaptPay? Nothing happens unless the password is entered, so you can close this page.
            </p>
          </form>
        )}

        {state === "success" && (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-[#00f1d7]/20 flex items-center justify-center mb-5">
              <CheckCircle className="w-8 h-8 text-[#00f1d7]" />
            </div>
            <h1 className="text-white text-xl font-semibold mb-2">Email confirmed!</h1>
            <p className="text-white/60 text-sm leading-relaxed mb-6">
              Your application has been submitted. Taking you to sign in…
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

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Lock, ArrowRight, Eye, EyeOff, Check, X } from "lucide-react";
import logoImage from "@assets/IMG_6592_1755070818452.png";

const inputClass =
  "w-full rounded-2xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm focus:outline-none focus:border-[#00f1d7] focus:bg-white/15 transition-colors";
const labelClass = "block text-xs text-white/60 mb-1 uppercase tracking-wide";

function PasswordRule({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs transition-colors ${met ? "text-[#00f1d7]" : "text-white/40"}`}>
      {met ? <Check className="w-3 h-3 flex-shrink-0" /> : <X className="w-3 h-3 flex-shrink-0" />}
      {label}
    </div>
  );
}

export default function MerchantSignup() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const set = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const rules = {
    length: formData.password.length >= 8,
    upper: /[A-Z]/.test(formData.password),
    lower: /[a-z]/.test(formData.password),
    number: /[0-9]/.test(formData.password),
  };
  const passwordValid = Object.values(rules).every(Boolean);
  const confirmMatch = formData.confirmPassword === "" || formData.password === formData.confirmPassword;
  const confirmComplete = formData.confirmPassword !== "" && formData.password === formData.confirmPassword;

  const signupMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/merchants/signup", data);
      return response.json();
    },
    onSuccess: (data) => {
      setLocation(`/check-email?email=${encodeURIComponent(data.merchant.email)}&id=${data.merchant.id}`);
    },
    onError: (error: any) => {
      let description = "Failed to create account. Please try again.";
      try {
        const raw = error.message || "";
        const jsonPart = raw.substring(raw.indexOf("{"));
        const parsed = JSON.parse(jsonPart);
        description = parsed.message || description;
      } catch {}
      toast({ title: "Signup failed", description, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      setPasswordTouched(true);
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    signupMutation.mutate(formData);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "#0055ff", fontFamily: "Outfit, sans-serif" }}
    >
      {/* Back */}
      <div className="w-full max-w-sm mb-4">
        <button
          onClick={() => setLocation("/")}
          className="text-white/50 hover:text-white text-xs uppercase tracking-widest flex items-center gap-1.5 transition-colors"
        >
          ← back
        </button>
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src={logoImage}
            alt="TaptPay"
            className="h-10 w-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </div>

        <h1 className="text-white text-2xl font-light mb-1">Create account</h1>
        <p className="text-white/50 text-sm mb-8">
          Already have one?{" "}
          <button
            onClick={() => setLocation("/login")}
            className="text-[#00f1d7] hover:underline font-medium"
          >
            Sign in
          </button>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Full name</label>
            <input
              type="text"
              placeholder="Your full name"
              value={formData.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Email address</label>
            <input
              type="email"
              placeholder="you@email.com"
              value={formData.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={formData.password}
                onChange={(e) => { set("password", e.target.value); setPasswordTouched(true); }}
                className={inputClass + " pr-10"}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordTouched && (
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 px-1">
                <PasswordRule met={rules.length} label="8+ characters" />
                <PasswordRule met={rules.upper} label="Uppercase letter" />
                <PasswordRule met={rules.lower} label="Lowercase letter" />
                <PasswordRule met={rules.number} label="Number" />
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="Repeat your password"
                value={formData.confirmPassword}
                onChange={(e) => set("confirmPassword", e.target.value)}
                className={
                  inputClass +
                  " pr-10" +
                  (!confirmMatch ? " border-red-400/60" : confirmComplete ? " border-[#00f1d7]/60" : "")
                }
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {!confirmMatch && (
              <p className="mt-1 text-xs text-red-300 px-1">Passwords don't match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={signupMutation.isPending}
            className="w-full bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors mt-2 disabled:opacity-60"
          >
            {signupMutation.isPending ? (
              <>
                <Lock className="w-4 h-4 animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-white/30 text-xs text-center mt-8 leading-relaxed">
          By continuing you agree to TaptPay's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

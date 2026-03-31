import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ClipboardList, ShieldCheck, CreditCard, Zap, ArrowRight, Mail, RefreshCw } from "lucide-react";
import logoImage from "@assets/IMG_6592_1755070818452.png";

const inputClass =
  "w-full rounded-2xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm focus:outline-none focus:border-[#00f1d7] focus:bg-white/15 transition-colors";
const labelClass = "block text-xs text-white/60 mb-1 uppercase tracking-wide";
const optionalBadge = <span className="ml-1.5 text-white/30 normal-case text-[10px]">optional</span>;

function getMerchantId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

export default function BusinessDetails() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isSuccess, setIsSuccess] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [merchantEmail, setMerchantEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const id = getMerchantId();
    if (!id) {
      setEmailVerified(true);
      return;
    }
    fetch(`/api/merchants/${id}/email-status`)
      .then(async (r) => {
        if (!r.ok) { setEmailVerified(false); return; }
        const data = await r.json();
        setEmailVerified(data.emailVerified ?? false);
        setMerchantEmail(data.email || "");
      })
      .catch(() => setEmailVerified(false));
  }, []);

  const handleResend = async () => {
    if (!merchantEmail) return;
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: merchantEmail }),
      });
      if (res.ok) {
        setResent(true);
        toast({ title: "Email sent", description: "Check your inbox for the confirmation link." });
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

  const [formData, setFormData] = useState({
    businessName: "",
    director: "",
    contactEmail: "",
    contactPhone: "",
    gstNumber: "",
    businessAddress: "",
    nzbn: "",
  });

  const set = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const submitMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const id = getMerchantId();
      if (!id) throw new Error("Missing merchant ID");
      const response = await apiRequest("PUT", `/api/merchants/${id}/business-details`, data);
      return response.json();
    },
    onSuccess: () => setIsSuccess(true),
    onError: (error: any) => {
      let description = "Failed to save details. Please try again.";
      try {
        const raw = error.message || "";
        const jsonPart = raw.substring(raw.indexOf("{"));
        const parsed = JSON.parse(jsonPart);
        description = parsed.message || description;
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate(formData);
  };

  if (emailVerified === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0055ff" }}>
        <div className="w-7 h-7 border-2 border-[#00f1d7] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (emailVerified === false) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
        style={{ background: "#0055ff", fontFamily: "Outfit, sans-serif" }}
      >
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-6">
            <img src={logoImage} alt="TaptPay" className="h-8 w-auto" style={{ filter: "brightness(0) invert(1)" }} />
          </div>

          <div className="mx-auto w-16 h-16 rounded-full bg-[#00f1d7]/20 flex items-center justify-center mb-5">
            <Mail className="w-8 h-8 text-[#00f1d7]" />
          </div>

          <h1 className="text-white text-xl font-semibold mb-2">Verify your email first</h1>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            Before you can complete your business details, please confirm your email address using the link we sent you.
          </p>

          <div className="bg-white/10 border border-white/15 rounded-2xl p-4 mb-6">
            <p className="text-white/70 text-sm">
              Check your inbox at <span className="text-white font-medium">{merchantEmail || "your email"}</span>
            </p>
          </div>

          <button
            onClick={handleResend}
            disabled={resending || resent}
            className="w-full flex items-center justify-center gap-2 text-sm text-[#00f1d7] hover:text-white border border-[#00f1d7]/40 hover:border-white/40 rounded-2xl py-3 transition-colors disabled:opacity-50 mb-4"
          >
            {resending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {resent ? "Email sent!" : resending ? "Sending..." : "Resend confirmation email"}
          </button>

          <button
            onClick={() => window.location.reload()}
            className="text-white/40 hover:text-white text-xs underline transition-colors"
          >
            I've confirmed my email — refresh
          </button>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    const steps = [
      {
        icon: <ClipboardList className="w-5 h-5 text-[#0055FF]" />,
        title: "Details submitted",
        description: "Your business information has been received by the TaptPay team.",
        done: true,
      },
      {
        icon: <ShieldCheck className="w-5 h-5 text-[#0055FF]" />,
        title: "KYC & AML verification",
        description: "We'll submit your application to Windcave who will be in touch to complete identity and compliance checks.",
        done: false,
      },
      {
        icon: <CreditCard className="w-5 h-5 text-[#0055FF]" />,
        title: "Add a payment card",
        description: "Once your account is set up, you'll add a valid card to your TaptPay account for payouts.",
        done: false,
      },
      {
        icon: <Zap className="w-5 h-5 text-[#0055FF]" />,
        title: "Start collecting payments",
        description: "Once approved, your QR code and payment link will be live and ready to go.",
        done: false,
      },
    ];

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "#0055ff", fontFamily: "Outfit, sans-serif" }}>
        <div className="w-full max-w-md">
          <div className="bg-white rounded-[32px] overflow-hidden shadow-2xl">
            <div className="bg-[#0055FF] px-8 pt-8 pb-6 text-center">
              <div className="mx-auto w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl text-white font-bold">You're on your way!</h2>
              <p className="text-white/75 text-sm mt-2">Business details received for <span className="font-semibold text-white">{formData.businessName}</span></p>
            </div>

            <div className="px-6 pt-6 pb-8 space-y-5">
              <p className="text-sm text-gray-500 text-center">Here's what happens next:</p>
              <div className="space-y-4">
                {steps.map((step, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? "bg-[#0055FF]/10" : "bg-gray-100"}`}>
                        {step.done ? step.icon : <span className="text-xs font-bold text-gray-400">{i + 1}</span>}
                      </div>
                      {i < steps.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1 mb-1" />}
                    </div>
                    <div className="pt-1 pb-4">
                      <p className={`text-sm font-semibold ${step.done ? "text-[#0055FF]" : "text-gray-800"}`}>
                        {step.title} {step.done && <span className="text-[#00E5CC]">✓</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-[#00E5CC]/10 border border-[#00E5CC]/30 rounded-2xl p-4 text-center">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Keep an eye on your inbox — Windcave will reach out directly to complete your verification.
                </p>
              </div>

              <button
                onClick={() => setLocation("/")}
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white rounded-2xl py-4 font-semibold transition-colors"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10" style={{ background: "#0055ff", fontFamily: "Outfit, sans-serif" }}>
      {/* Step indicator */}
      <div className="w-full max-w-md mb-6 flex items-center gap-3">
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white">✓</div>
          <span>Account</span>
        </div>
        <div className="flex-1 h-px bg-white/20" />
        <div className="flex items-center gap-2 text-white text-xs">
          <div className="w-5 h-5 rounded-full bg-[#00f1d7] flex items-center justify-center text-[10px] font-bold text-[#000a36]">2</div>
          <span className="font-semibold">Business details</span>
        </div>
      </div>

      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src={logoImage} alt="TaptPay" className="h-8 w-auto" style={{ filter: "brightness(0) invert(1)" }} />
        </div>

        <h1 className="text-white text-2xl font-light mb-1">Tell us about your business</h1>
        <p className="text-white/50 text-sm mb-8">This information is used for your merchant account and KYC verification.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mandatory section */}
          <div className="bg-white/5 rounded-3xl p-5 space-y-4 border border-white/10">
            <p className="text-[#00f1d7] text-xs uppercase tracking-widest">Required</p>

            <div>
              <label className={labelClass}>Business name</label>
              <input type="text" placeholder="Your legal business name" value={formData.businessName} onChange={(e) => set("businessName", e.target.value)} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Director / responsible person</label>
              <input type="text" placeholder="Full legal name" value={formData.director} onChange={(e) => set("director", e.target.value)} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Business email</label>
              <input type="email" placeholder="business@email.com" value={formData.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Phone number</label>
              <input type="tel" placeholder="+64 21 000 0000" value={formData.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>GST number</label>
              <input type="text" placeholder="e.g. 123-456-789" value={formData.gstNumber} onChange={(e) => set("gstNumber", e.target.value)} className={inputClass} required />
            </div>
          </div>

          {/* Optional section */}
          <div className="bg-white/5 rounded-3xl p-5 space-y-4 border border-white/10">
            <p className="text-white/40 text-xs uppercase tracking-widest">Optional</p>

            <div>
              <label className={labelClass}>Business address {optionalBadge}</label>
              <input type="text" placeholder="123 Main Street, Auckland" value={formData.businessAddress} onChange={(e) => set("businessAddress", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>NZBN {optionalBadge}</label>
              <input type="text" placeholder="New Zealand Business Number" value={formData.nzbn} onChange={(e) => set("nzbn", e.target.value)} className={inputClass} />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="w-full bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60 mt-2"
          >
            {submitMutation.isPending ? "Submitting..." : (
              <>Submit business details <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        <p className="text-white/30 text-xs text-center mt-6 leading-relaxed">
          Your information is stored securely and used only for account verification.
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, Building2, User, Landmark, FileText, Globe } from "lucide-react";

const INPUT_CLASS =
  "mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const TEXTAREA_CLASS =
  "mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px] resize-none";

export default function MerchantOnboarding() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  const { data: authData } = useQuery<{
    user: { id: number; email: string; merchantId: number; role: string };
  }>({
    queryKey: ["/api/auth/me"],
  });

  const merchantId = authData?.user?.merchantId;

  const { data: merchantData } = useQuery<{
    id: number;
    name: string;
    businessName: string;
    businessType: string;
    email: string;
    phone: string;
    address: string;
    director: string;
    nzbn: string;
    gstNumber: string;
    bankName: string;
    bankAccountNumber: string;
    bankBranch: string;
    accountHolderName: string;
  }>({
    queryKey: [`/api/merchants/${merchantId}`],
    enabled: !!merchantId,
  });

  const [form, setForm] = useState({
    director: "",
    nzbn: "",
    gstNumber: "",
    bankName: "",
    bankAccountNumber: "",
    bankBranch: "",
    accountHolderName: "",
    websiteUrl: "",
    estimatedAnnualTurnover: "",
    businessDescription: "",
  });

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/merchants/${merchantId}/onboarding`, form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setShowSuccessDialog(true);
    },
    onError: (err: any) => {
      toast({
        title: "Submission Failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.director.trim()) {
      toast({ title: "Required", description: "Please enter the director's full legal name.", variant: "destructive" });
      return;
    }
    if (!form.bankAccountNumber.trim()) {
      toast({ title: "Required", description: "Please enter your bank account number.", variant: "destructive" });
      return;
    }
    if (!form.accountHolderName.trim()) {
      toast({ title: "Required", description: "Please enter the account holder name.", variant: "destructive" });
      return;
    }
    submitMutation.mutate();
  };

  const SectionHeader = ({ icon: Icon, title }: { icon: any; title: string }) => (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-200">
      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
        <Icon className="w-4 h-4 text-blue-600" />
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-600 mb-4">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Complete Your Business Profile</h1>
          <p className="text-gray-500 mt-2 text-sm max-w-md mx-auto">
            To activate your account and start accepting payments, we need a few more details for identity verification.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-gray-600">Account Created</span>
          </div>
          <div className="h-px w-8 bg-gray-300" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-gray-600">Email Verified</span>
          </div>
          <div className="h-px w-8 bg-gray-300" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-xs font-bold text-white">3</span>
            </div>
            <span className="text-sm font-semibold text-blue-700">Business Details</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Pre-filled summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader icon={Building2} title="Registered Business Details" />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 block">Business Name</span>
                <span className="font-medium text-gray-900">{merchantData?.businessName || "—"}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Business Type</span>
                <span className="font-medium text-gray-900 capitalize">{merchantData?.businessType || "—"}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Email</span>
                <span className="font-medium text-gray-900">{merchantData?.email || "—"}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Phone</span>
                <span className="font-medium text-gray-900">{merchantData?.phone || "—"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 block">Address</span>
                <span className="font-medium text-gray-900">{merchantData?.address || "—"}</span>
              </div>
            </div>
          </div>

          {/* Director / Owner */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader icon={User} title="Director / Business Owner" />
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Director's Full Legal Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="As it appears on official ID"
                  value={form.director}
                  onChange={(e) => set("director", e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">NZBN</label>
                  <input
                    type="text"
                    placeholder="NZ Business Number"
                    value={form.nzbn}
                    onChange={(e) => set("nzbn", e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">GST Number</label>
                  <input
                    type="text"
                    placeholder="If GST registered"
                    value={form.gstNumber}
                    onChange={(e) => set("gstNumber", e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Business details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader icon={Globe} title="Additional Business Information" />
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Business Description</label>
                <textarea
                  placeholder="Briefly describe what your business does"
                  value={form.businessDescription}
                  onChange={(e) => set("businessDescription", e.target.value)}
                  className={TEXTAREA_CLASS}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Website URL</label>
                  <input
                    type="url"
                    placeholder="https://yourbusiness.co.nz"
                    value={form.websiteUrl}
                    onChange={(e) => set("websiteUrl", e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Estimated Annual Card Turnover</label>
                  <select
                    value={form.estimatedAnnualTurnover}
                    onChange={(e) => set("estimatedAnnualTurnover", e.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">Select range</option>
                    <option value="Under $50k">Under $50,000</option>
                    <option value="$50k–$150k">$50,000 – $150,000</option>
                    <option value="$150k–$500k">$150,000 – $500,000</option>
                    <option value="$500k–$1m">$500,000 – $1,000,000</option>
                    <option value="Over $1m">Over $1,000,000</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Bank account */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader icon={Landmark} title="Bank Account for Settlements" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Bank Name</label>
                  <select
                    value={form.bankName}
                    onChange={(e) => set("bankName", e.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">Select bank</option>
                    <option value="ANZ">ANZ</option>
                    <option value="ASB">ASB</option>
                    <option value="BNZ">BNZ</option>
                    <option value="Kiwibank">Kiwibank</option>
                    <option value="Westpac">Westpac</option>
                    <option value="Cooperative Bank">Cooperative Bank</option>
                    <option value="TSB">TSB</option>
                    <option value="Rabobank">Rabobank</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Account Holder Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Name on the account"
                    value={form.accountHolderName}
                    onChange={(e) => set("accountHolderName", e.target.value)}
                    className={INPUT_CLASS}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Account Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="00-0000-0000000-00"
                    value={form.bankAccountNumber}
                    onChange={(e) => set("bankAccountNumber", e.target.value)}
                    className={INPUT_CLASS}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Branch / Reference</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={form.bankBranch}
                    onChange={(e) => set("bankBranch", e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Legal notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                By submitting, you confirm that all information is accurate and you authorise TaptPay and Windcave to use these details for KYC, AML, and payment processing purposes in accordance with our <a href="/terms" className="underline font-medium">Terms of Service</a>.
              </p>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit Business Details"}
          </Button>
        </form>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-2">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <DialogTitle className="text-center text-xl">Details Submitted</DialogTitle>
            <DialogDescription className="text-center text-base text-gray-700 mt-2">
              Your details have been sent to Windcave for registration, KYC and AML verification. Windcave will be in touch.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 mt-2">
            <p className="font-medium text-gray-800 mb-1">What happens next?</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Windcave reviews your business details</li>
              <li>KYC and AML verification is completed</li>
              <li>You'll be contacted directly to finalise your account</li>
            </ol>
          </div>
          <Button
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => setLocation("/dashboard")}
          >
            Go to Dashboard
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

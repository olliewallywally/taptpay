import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Store, Lock, ClipboardList, ShieldCheck, CreditCard, Zap } from "lucide-react";

export default function MerchantSignup() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  
  // Form state using plain React state (not React Hook Form to avoid input blocking)
  const [formData, setFormData] = useState({
    name: "",
    businessName: "",
    businessType: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    confirmPassword: "",
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const signupMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/merchants/signup", data);
      return response.json();
    },
    onSuccess: () => {
      setSubmittedEmail(formData.email);
      setIsSuccess(true);
    },
    onError: (error: any) => {
      // apiRequest throws as "STATUS: {json}" — extract the human-readable message
      let description = "Failed to create account. Please try again.";
      try {
        const raw = error.message || "";
        const jsonPart = raw.substring(raw.indexOf("{"));
        const parsed = JSON.parse(jsonPart);
        description = parsed.message || description;
      } catch {}
      toast({
        title: "Signup failed",
        description,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.businessType) {
      toast({
        title: "Validation Error",
        description: "Please select a business type",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 8) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    if (!/[A-Z]/.test(formData.password) || !/[a-z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
      toast({
        title: "Validation Error",
        description: "Password must contain at least one uppercase letter, one lowercase letter, and one number",
        variant: "destructive",
      });
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Validation Error", 
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }
    
    signupMutation.mutate(formData);
  };

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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-xl rounded-3xl overflow-hidden">
            <div className="bg-[#0055FF] px-8 pt-8 pb-6 text-center">
              <div className="mx-auto w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl text-white font-bold">You're on your way!</CardTitle>
              <p className="text-white/75 text-sm mt-2">
                Account created for <span className="font-semibold text-white">{submittedEmail}</span>
              </p>
            </div>

            <CardContent className="px-6 pt-6 pb-8 space-y-5">
              <p className="text-sm text-gray-500 text-center">Here's what happens next:</p>

              <div className="space-y-4">
                {steps.map((step, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? "bg-[#0055FF]/10" : "bg-gray-100"}`}>
                        {step.done ? step.icon : <span className="text-xs font-bold text-gray-400">{i + 1}</span>}
                      </div>
                      {i < steps.length - 1 && (
                        <div className="w-px flex-1 bg-gray-200 mt-1 mb-1" />
                      )}
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
                  Keep an eye on your email at <span className="font-semibold text-[#0055FF]">{submittedEmail}</span> — Windcave will reach out directly to complete your verification.
                </p>
              </div>

              <Button
                onClick={() => setLocation("/")}
                className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-white rounded-2xl py-5 font-semibold"
              >
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Store className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Join Tapt Today</CardTitle>
            <p className="text-gray-600 mt-2">
              Start accepting payments with our modern terminal solution
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Full Name</label>
                  <input
                    type="text"
                    placeholder="Your full name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Business Name</label>
                  <input
                    type="text"
                    placeholder="Legal business name"
                    value={formData.businessName}
                    onChange={(e) => handleInputChange('businessName', e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Select business type</label>
                <select
                  value={formData.businessType}
                  onChange={(e) => handleInputChange('businessType', e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                >
                  <option value="">Select business type</option>
                  <option value="cafe">Cafe/Restaurant</option>
                  <option value="retail">Retail Store</option>
                  <option value="service">Service Business</option>
                  <option value="online">Online Business</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Email Address</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+64 21 000 0000"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Business Address</label>
                <input
                  type="text"
                  placeholder="123 Main Street"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Password</label>
                  <input
                    type="password"
                    placeholder="Create password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Confirm Password</label>
                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={signupMutation.isPending}
              >
                {signupMutation.isPending ? (
                  <>
                    <Lock className="w-4 h-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <div className="text-center mt-4">
              <p className="text-sm text-gray-600">
                Already have an account?{" "}
                <button
                  onClick={() => setLocation("/login")}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Sign in here
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
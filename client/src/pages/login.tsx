import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SEOHead } from "@/components/SEOHead";
import { ChevronDown, ArrowLeft } from "lucide-react";
import taptLogoPath from "@assets/IMG_6592_1755070818452.png";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loginType, setLoginType] = useState<'merchant' | 'admin'>('merchant');

  // Handle Google OAuth callback — token arrives as URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const merchantId = params.get('merchantId');
    const error = params.get('error');
    const newUser = params.get('newUser');

    if (token) {
      localStorage.setItem('authToken', token);
      if (merchantId) localStorage.setItem('merchantId', merchantId);
      window.history.replaceState({}, '', '/login');
      if (newUser === 'true') {
        toast({
          title: 'Welcome to TaptPay!',
          description: 'Your account has been created. Please complete your profile in Settings.',
        });
      } else {
        toast({ title: 'Welcome back!', description: 'Signed in with Google.' });
      }
      setLocation('/dashboard');
    } else if (error) {
      window.history.replaceState({}, '', '/login');
      toast({ title: 'Sign in failed', description: decodeURIComponent(error), variant: 'destructive' });
    }
  }, []);

  const [showMore, setShowMore] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");

  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [successMessage, setSuccessMessage] = useState("");

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const endpoint = loginType === 'merchant' ? "/api/auth/login" : "/api/admin/auth/login";
      const response = await apiRequest("POST", endpoint, data);
      return response.json();
    },
    onSuccess: (result) => {
      if (loginType === 'merchant') {
        localStorage.setItem("authToken", result.token);
        localStorage.setItem("user", JSON.stringify(result.user));
        
        toast({
          title: "Welcome back!",
          description: "You have been successfully logged in.",
        });

        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get("returnTo");
        setLocation(returnTo || "/dashboard");
      } else {
        localStorage.setItem("adminAuthToken", result.token);
        localStorage.setItem("adminUser", JSON.stringify(result.user));
        
        toast({
          title: "Admin Access Granted",
          description: "Welcome to the Tapt Admin Dashboard",
        });
        
        setLocation("/admin");
      }
    },
    onError: (error: any) => {
      setErrors({ general: error.message || "Invalid credentials. Please try again." });
    },
  });

  const validateForm = () => {
    const newErrors: { email?: string; password?: string; general?: string } = {};

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccessMessage('');

    if (!validateForm()) return;

    loginMutation.mutate(formData);
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-6 px-4">
      <SEOHead
        title="Login - TapTpay Payment Terminal"
        description="Access your TapTpay merchant account to manage payments, view transactions, track revenue, and configure your payment settings."
        keywords="merchant login, payment dashboard, taptpay login, business account, payment terminal login"
        ogTitle="Login to TapTpay"
        ogDescription="Sign in to your merchant dashboard to manage payments and track your business."
      />

      {/* Back button sits in its own row above the card — zero overlap guaranteed */}
      <div className="w-full max-w-xs md:max-w-sm lg:max-w-md mb-3 flex items-center">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-gray-500 hover:text-[#0055FF] transition-colors group"
          data-testid="button-back-to-landing"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium text-sm">Back</span>
        </button>
      </div>

      <div className="w-full max-w-xs md:max-w-sm lg:max-w-md">
        {/* Main login card — outer wrapper owns the outermost rounded corners */}
        <div className="shadow-2xl overflow-hidden rounded-[40px] md:rounded-[48px]">
          {/* Blue section — rounded bottom, sits above the cyan strip */}
          <div className="bg-[#0055FF] px-6 md:px-10 pt-10 md:pt-12 pb-7 md:pb-10 rounded-b-[32px] md:rounded-b-[40px] relative z-[1]">
            {/* Logo */}
            <div className="text-center mb-8 md:mb-10">
              <img src={taptLogoPath} alt="taptpay" className="h-8 md:h-10 mx-auto" style={{ filter: 'brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)' }} />
            </div>

            {/* Success message */}
            {successMessage && (
              <div className="mb-4 p-3 md:p-4 bg-[#00E5CC] text-[#0055FF] rounded-full text-center font-medium">
                {successMessage}
              </div>
            )}

            {/* General error message */}
            {errors.general && (
              <div className="mb-4 p-3 md:p-4 bg-red-500 text-white rounded-full text-center font-medium">
                {errors.general}
              </div>
            )}

            {/* Login Type Toggle (subtle) */}
            {!isSignup && (
              <div className="mb-6 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setLoginType('merchant')}
                  className={`px-4 py-1 rounded-full text-xs transition-all ${
                    loginType === 'merchant'
                      ? 'bg-[#00E5CC] text-[#0055FF] font-medium'
                      : 'text-[#00E5CC] hover:text-white'
                  }`}
                >
                  Merchant
                </button>
                <button
                  type="button"
                  onClick={() => setLoginType('admin')}
                  className={`px-4 py-1 rounded-full text-xs transition-all ${
                    loginType === 'admin'
                      ? 'bg-[#00E5CC] text-[#0055FF] font-medium'
                      : 'text-[#00E5CC] hover:text-white'
                  }`}
                >
                  Admin
                </button>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Name field (signup only) */}
              {isSignup && (
                <div>
                  <label htmlFor="name" className="block text-[#00E5CC] mb-2 ml-3 md:ml-4 text-sm md:text-base">
                    name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-transparent border-2 border-[#00E5CC] rounded-full px-6 md:px-8 py-4 md:py-5 text-white placeholder-blue-300 focus:outline-none focus:border-[#00FFE5] transition-colors"
                    placeholder=""
                  />
                </div>
              )}

              {/* Email field */}
              <div>
                <label htmlFor="email" className="block text-[#00E5CC] mb-2 ml-3 md:ml-4 text-sm md:text-base">
                  email
                </label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                  className={`w-full bg-transparent border-2 ${
                    errors.email ? 'border-red-500' : 'border-[#00E5CC]'
                  } rounded-full px-6 md:px-8 py-4 md:py-5 text-white placeholder-blue-300 focus:outline-none focus:border-[#00FFE5] transition-colors`}
                  placeholder=""
                  data-testid="input-email"
                />
                {errors.email && (
                  <p className="text-red-400 mt-2 ml-3 md:ml-4 text-sm">{errors.email}</p>
                )}
              </div>

              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-[#00E5CC] mb-2 ml-3 md:ml-4 text-sm md:text-base">
                  password
                </label>
                <input
                  type="password"
                  id="password"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (errors.password) setErrors({ ...errors, password: undefined });
                  }}
                  className={`w-full bg-transparent border-2 ${
                    errors.password ? 'border-red-500' : 'border-[#00E5CC]'
                  } rounded-full px-6 md:px-8 py-4 md:py-5 text-white placeholder-blue-300 focus:outline-none focus:border-[#00FFE5] transition-colors`}
                  placeholder=""
                  data-testid="input-password"
                />
                {errors.password && (
                  <p className="text-red-400 mt-2 ml-3 md:ml-4 text-sm">{errors.password}</p>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full bg-[#00E5CC] text-[#0055FF] rounded-full py-4 mt-6 hover:bg-[#00FFE5] transition-colors text-center font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-login"
              >
                {loginMutation.isPending ? 'loading...' : isSignup ? 'sign up' : 'login'}
              </button>
            </form>

            {/* Social login buttons */}
            <div className="mt-5 space-y-3">
              <div className="text-center text-[#00E5CC] mb-3 md:mb-4 text-sm md:text-base">or continue with</div>
              
              <button
                onClick={handleGoogleLogin}
                className="w-full bg-white text-[#0055FF] rounded-full py-3 md:py-4 hover:bg-gray-100 transition-colors text-center flex items-center justify-center gap-2 font-medium"
                data-testid="button-google-login"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>

              <button
                onClick={() => setLocation('/signup')}
                className="w-full bg-[#00E5CC] text-[#0055FF] rounded-full py-3 md:py-4 hover:opacity-90 transition-opacity text-center flex items-center justify-center gap-2 font-medium"
                data-testid="button-signup"
              >
                Create account
              </button>
            </div>
          </div>

          {/* Cyan bottom section — pulled up under the blue rounded bottom */}
          <div 
            className="bg-[#00E5CC] -mt-8 pt-10 pb-4 px-6 flex items-center justify-center cursor-pointer hover:bg-[#00FFE5] transition-colors"
            onClick={() => setShowMore(!showMore)}
            data-testid="button-show-more"
          >
            <span className="text-[#0055FF] text-center font-medium">more</span>
            <ChevronDown 
              className="text-[#0055FF] transition-transform duration-300 ml-2" 
              style={{ transform: showMore ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </div>

          {/* Expandable more section */}
          {showMore && (
            <div className="bg-[#00E5CC] px-8 md:px-12 pb-6 md:pb-8 space-y-3 md:space-y-4">
              <button 
                onClick={() => {
                  toast({
                    title: "Password Reset",
                    description: "Password reset functionality coming soon!",
                  });
                }}
                className="w-full text-left text-[#0055FF] hover:underline font-medium"
              >
                Forgot password?
              </button>
              <button 
                onClick={() => {
                  setIsSignup(!isSignup);
                  setErrors({});
                  setSuccessMessage('');
                }}
                className="w-full text-left text-[#0055FF] hover:underline font-medium"
                data-testid="button-toggle-signup"
              >
                {isSignup ? 'Already have an account? Login' : 'Create account'}
              </button>
              <button 
                onClick={() => {
                  toast({
                    title: "Help & Support",
                    description: "Contact support@tapt.co.nz for assistance",
                  });
                }}
                className="w-full text-left text-[#0055FF] hover:underline font-medium"
              >
                Help & Support
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { clearSignOutPending } from "@/lib/session";
import { apiErrorMessage } from "@/lib/api-error";
import { trackEvent } from "@/lib/analytics";
import { appleSignInOffered, leaveToSignInWithApple } from "@/lib/apple-sign-in";
import { apiPath, apiTo } from "@shared/api-path";
import { SEOHead } from "@/components/SEOHead";
import { ChevronDown, ArrowLeft } from "lucide-react";
import taptLogoPath from "@assets/IMG_6592_1755070818452.png";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

// Google's and Apple's sign-in results, removed from the address on arrival. Everything else
// (returnTo) stays for the password form.
const GOOGLE_SIGN_IN_PARAMS = ['google', 'apple', 'error', 'token', 'merchantId', 'newUser'];

// The two sign-ins a provider hands back here (R1-T4 phase A; Apple's is R1-T5d): where the page
// redeems the one-time code, and the words it uses.
const HANDOFFS = {
  google: { name: 'Google', session: apiPath("POST /api/auth/google/session") },
  apple: { name: 'Apple', session: apiPath("POST /api/auth/apple/session") },
} as const;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loginType, setLoginType] = useState<'merchant' | 'admin'>('merchant');

  // Finish Google sign-in (R1-T4 phase A). The server never puts an account
  // token in the address: it sets a one-time code in an HttpOnly cookie and
  // sends the browser to /login?google=complete, and this page redeems the code
  // once, by POST, for the token in the response body. A token found in the
  // address (the old hand-back, or a crafted link) is dropped unused.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Only the fixed word redeems, and Google's is read first, as it always was.
    const provider = params.get('google') === 'complete' ? 'google' : params.get('apple') === 'complete' ? 'apple' : null;
    const error = params.get('error');

    if (GOOGLE_SIGN_IN_PARAMS.some((name) => params.has(name))) {
      GOOGLE_SIGN_IN_PARAMS.forEach((name) => params.delete(name));
      const rest = params.toString();
      window.history.replaceState({}, '', `/login${rest ? `?${rest}` : ''}${window.location.hash}`);
    }

    const signInFailed = (description: string, method: 'google' | 'apple') => {
      trackEvent("login_failed", { auth_method: method, login_type: "merchant" });
      toast({ title: 'Sign in failed', description, variant: 'destructive' });
    };

    if (provider) {
      const handoff = HANDOFFS[provider];
      void (async () => {
        let result: { csrfToken?: unknown; merchantId?: unknown; newUser?: unknown; message?: unknown } = {};
        let ok = false;
        try {
          const response = await fetch(handoff.session, { method: 'POST', credentials: 'same-origin' });
          ok = response.ok;
          result = await response.json().catch(() => ({}));
        } catch {
          // Network failure: fall through to the generic message.
        }
        if (!ok || typeof result.csrfToken !== 'string') {
          signInFailed(typeof result.message === 'string' ? result.message : `${handoff.name} sign in failed. Please try again.`, provider);
          return;
        }
        const newUser = result.newUser === true;
        trackEvent("login_succeeded", { auth_method: provider, login_type: "merchant", new_user: newUser });
        // R1-T4 phase E: the sign-in is the session cookie the server just set, which no script can
        // read; nothing is stored here. The next page load's start-up check reads the session.
        clearSignOutPending();
        if (newUser) {
          toast({
            title: 'Welcome to TaptPay!',
            description: 'Your account has been created. Please complete your profile in Settings.',
          });
        } else {
          toast({ title: 'Welcome back!', description: `Signed in with ${handoff.name}.` });
        }
        // Match password login: force the app-wide AuthProvider to re-mount and
        // read the new session instead of keeping stale state.
        window.location.href = '/dashboard';
      })();
    } else if (error) {
      // Both providers come back to ?error= with the server's own fixed words; Apple's all name Apple.
      // Only the count in analytics depends on telling them apart.
      signInFailed(error, /apple/i.test(error) ? 'apple' : 'google');
    }
  }, []);

  // R1-T5d (owner decision 2026-09-29: Sign in with Apple goes live once Apple is set up). The page
  // asks the server whether it is offered and shows the button only on a yes: until then, and whenever
  // the server cannot say, the page is exactly as it was.
  const [appleOffered, setAppleOffered] = useState(false);
  useEffect(() => {
    const asking = new AbortController();
    void appleSignInOffered(asking.signal).then((offered) => {
      if (!asking.signal.aborted) setAppleOffered(offered);
    });
    return () => asking.abort();
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
      const signIn = loginType === 'merchant' ? apiTo("POST /api/auth/login") : apiTo("POST /api/admin/auth/login");
      const response = await apiRequest(...signIn, data);
      return response.json();
    },
    onSuccess: () => {
      trackEvent("login_succeeded", { auth_method: "password", login_type: loginType });
      // R1-T4 phase E: the sign-in is the session cookie the server just set, which no script can read;
      // nothing is stored here. The next page load's start-up check reads the session.
      if (loginType === 'merchant') {
        clearSignOutPending();
        toast({
          title: "Welcome back!",
          description: "You have been successfully logged in.",
        });

        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get("returnTo");
        // Only honour same-origin absolute paths ("/...", not "//host" or
        // "scheme://"): returnTo is reflected from the URL, and a hard
        // navigation to it would otherwise be an open redirect.
        const dest = returnTo && /^\/(?!\/)/.test(returnTo) ? returnTo : "/dashboard";
        // Full-page navigation (not SPA setLocation): AuthProvider only checks
        // auth once on mount, so a client-side route change would leave its
        // cached state stale and ProtectedRoute would bounce back to /login.
        // A hard navigation re-initialises auth with the new session.
        window.location.href = dest;
      } else {
        toast({
          title: "Admin Access Granted",
          description: "Welcome to the Tapt Admin Dashboard",
        });

        window.location.href = "/admin";
      }
    },
    onError: (error: unknown) => {
      trackEvent("login_failed", { auth_method: "password", login_type: loginType });
      // The server's words, not the raw "429: {…}" failure text: a slowed-down
      // sign-in says how long to wait (R1-T4 phase C).
      setErrors({ general: apiErrorMessage(error, "Invalid credentials. Please try again.") });
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

    trackEvent("login_attempted", { auth_method: "password", login_type: loginType });
    loginMutation.mutate(formData);
  };

  const handleGoogleLogin = () => {
    trackEvent("login_attempted", { auth_method: "google", login_type: "merchant" });
    window.location.href = apiPath("GET /api/auth/google");
  };

  const handleAppleLogin = () => {
    trackEvent("login_attempted", { auth_method: "apple", login_type: "merchant" });
    leaveToSignInWithApple();
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
          className="tap-target flex items-center gap-1.5 text-gray-500 hover:text-[#040D6D] transition-colors group"
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
              <div className="mb-4 p-3 md:p-4 bg-[#00E5CC] text-[#040D6D] rounded-full text-center font-medium">
                {successMessage}
              </div>
            )}

            {/* General error message */}
            {errors.general && (
              <div role="alert" className="mb-4 p-3 md:p-4 bg-red-600 text-white rounded-full text-center font-medium">
                {errors.general}
              </div>
            )}

            {/* Login Type Toggle (subtle) */}
            {!isSignup && (
              <div className="mb-6 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setLoginType('merchant')}
                  className={`tap-target px-4 py-1 rounded-full text-xs transition-all ${
                    loginType === 'merchant'
                      ? 'bg-[#00E5CC] text-[#040D6D] font-medium'
                      : 'text-white hover:text-white'
                  }`}
                >
                  Merchant
                </button>
                <button
                  type="button"
                  onClick={() => setLoginType('admin')}
                  className={`tap-target px-4 py-1 rounded-full text-xs transition-all ${
                    loginType === 'admin'
                      ? 'bg-[#00E5CC] text-[#040D6D] font-medium'
                      : 'text-white hover:text-white'
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
                  <label htmlFor="name" className="block text-white mb-2 ml-3 md:ml-4 text-sm md:text-base">
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
                <label htmlFor="email" className="block text-white mb-2 ml-3 md:ml-4 text-sm md:text-base">
                  email
                </label>
                <input
                  type="email"
                  id="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
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
                  <p id="email-error" role="alert" className="text-white mt-2 ml-3 md:ml-4 text-sm">{errors.email}</p>
                )}
              </div>

              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-white mb-2 ml-3 md:ml-4 text-sm md:text-base">
                  password
                </label>
                <input
                  type="password"
                  id="password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
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
                  <p id="password-error" role="alert" className="text-white mt-2 ml-3 md:ml-4 text-sm">{errors.password}</p>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full bg-[#00E5CC] text-[#040D6D] rounded-full py-4 mt-6 hover:bg-[#00FFE5] transition-colors text-center font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-login"
              >
                {loginMutation.isPending ? 'loading...' : isSignup ? 'sign up' : 'login'}
              </button>
            </form>

            {/* Social login buttons */}
            <div className="mt-5 space-y-3">
              <div className="text-center text-white mb-3 md:mb-4 text-sm md:text-base">or continue with</div>

              <button
                onClick={handleGoogleLogin}
                className="w-full bg-white text-[#040D6D] rounded-full py-3 md:py-4 hover:bg-gray-100 transition-colors text-center flex items-center justify-center gap-2 font-medium"
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

              {/* R1-T5d: the same shape and size as Google's (App Store guideline 4.8), in Apple's black
                  with its mark. The mark's path is Font Awesome Free's Apple brand icon (CC BY 4.0). */}
              {appleOffered && (
                <button
                  type="button"
                  onClick={handleAppleLogin}
                  className="w-full bg-black text-white rounded-full py-3 md:py-4 hover:bg-neutral-800 transition-colors text-center flex items-center justify-center gap-2 font-medium"
                  data-testid="button-apple-login"
                >
                  <svg className="w-5 h-5" viewBox="0 0 384 512" aria-hidden="true">
                    <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                  </svg>
                  Continue with Apple
                </button>
              )}

              <button
                onClick={() => setLocation('/signup')}
                className="w-full bg-[#00E5CC] text-[#040D6D] rounded-full py-3 md:py-4 hover:opacity-90 transition-opacity text-center flex items-center justify-center gap-2 font-medium"
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
            <span className="text-[#040D6D] text-center font-medium">more</span>
            <ChevronDown
              className="text-[#040D6D] transition-transform duration-300 ml-2"
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
                className="w-full text-left text-[#040D6D] hover:underline font-medium"
              >
                Forgot password?
              </button>
              <button
                onClick={() => {
                  setIsSignup(!isSignup);
                  setErrors({});
                  setSuccessMessage('');
                }}
                className="w-full text-left text-[#040D6D] hover:underline font-medium"
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
                className="w-full text-left text-[#040D6D] hover:underline font-medium"
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

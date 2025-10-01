import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LogIn, Shield, UserPlus, Store, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import taptLogoPath from "@assets/IMG_6592_1755070818452.png";
import { createMerchantSchema, type CreateMerchant } from "@shared/schema";
import { AnimatedBrandBackground } from "@/components/backgrounds/AnimatedBrandBackground";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loginType, setLoginType] = useState<'merchant' | 'admin'>('merchant');
  const [showSignup, setShowSignup] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Simple signup form state
  const [signupData, setSignupData] = useState({
    name: "",
    businessName: "",
    businessType: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    confirmPassword: "",
  });

  const signupForm = useForm<CreateMerchant>({
    resolver: zodResolver(createMerchantSchema),
    mode: "onSubmit",
  });



  // Update form defaults when login type changes
  useEffect(() => {
    form.setValue("email", "");
    form.setValue("password", "");
  }, [loginType, form]);

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
        
        setLocation("/dashboard");
      } else {
        localStorage.setItem("adminAuthToken", result.token);
        localStorage.setItem("adminUser", JSON.stringify(result.user));
        
        toast({
          title: "Admin Access Granted",
          description: "Welcome to the Tapt Admin Dashboard",
        });
        
        setLocation("/admin/dashboard");
      }
    },
    onError: (error: any) => {
      toast({
        title: loginType === 'merchant' ? "Login Failed" : "Access Denied",
        description: error.message || `Invalid ${loginType} credentials. Please try again.`,
        variant: "destructive",
      });
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: CreateMerchant) => {
      const response = await apiRequest("POST", "/api/merchants/signup", data);
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Account Created Successfully!",
        description: "Please check your email to verify your account before logging in.",
      });
      setShowSignup(false);
      signupForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Signup Failed",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const onSignupSubmit = (data: CreateMerchant) => {
    signupMutation.mutate(data);
  };

  if (showSignup) {
    return (
      <AnimatedBrandBackground>
        <div className="w-full max-w-sm">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl">
            
            {/* Logo Section */}
            <div className="text-center mb-8">
              <div className="flex justify-center mb-6">
                <img 
                  src={taptLogoPath} 
                  alt="TaptPay" 
                  className="h-12 w-auto object-contain"
                />
              </div>
              <h1 className="text-2xl font-light text-white mb-2">
                Create Your Account
              </h1>
              <p className="text-white/70 text-sm">
                Join Tapt and start accepting payments
              </p>
            </div>

            {/* Back to Login Button */}
            <div className="mb-6">
              <Button
                variant="ghost"
                onClick={() => setShowSignup(false)}
                className="flex items-center space-x-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Login</span>
              </Button>
            </div>

            {/* Simple Signup Form */}
            <form onSubmit={(e) => {
              e.preventDefault();
              onSignupSubmit(signupData);
            }} className="space-y-4">
              
              {/* Full Name */}
              <div>
                <Label className="text-sm font-medium text-white/90">Full Name</Label>
                <Input
                  placeholder="John Smith"
                  value={signupData.name}
                  onChange={(e) => setSignupData(prev => ({...prev, name: e.target.value}))}
                  className="mt-2 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                />
              </div>

              {/* Business Name */}
              <div>
                <Label className="text-sm font-medium text-white/90">Business Name</Label>
                <Input
                  placeholder="My Business Ltd"
                  value={signupData.businessName}
                  onChange={(e) => setSignupData(prev => ({...prev, businessName: e.target.value}))}
                  className="mt-2 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                />
              </div>

              {/* Business Type */}
              <div>
                <Label className="text-sm font-medium text-white/90">Business Type</Label>
                <select
                  value={signupData.businessType}
                  onChange={(e) => setSignupData(prev => ({...prev, businessType: e.target.value}))}
                  className="mt-2 w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                >
                  <option value="" className="bg-slate-800 text-white">Select business type</option>
                  <option value="retail" className="bg-slate-800 text-white">Retail</option>
                  <option value="restaurant" className="bg-slate-800 text-white">Restaurant</option>
                  <option value="cafe" className="bg-slate-800 text-white">Cafe</option>
                  <option value="service" className="bg-slate-800 text-white">Service</option>
                  <option value="online" className="bg-slate-800 text-white">Online</option>
                  <option value="other" className="bg-slate-800 text-white">Other</option>
                </select>
              </div>

              {/* Email */}
              <div>
                <Label className="text-sm font-medium text-white/90">Email Address</Label>
                <Input
                  type="email"
                  placeholder="you@business.com"
                  value={signupData.email}
                  onChange={(e) => setSignupData(prev => ({...prev, email: e.target.value}))}
                  className="mt-2 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                />
              </div>

              {/* Phone */}
              <div>
                <Label className="text-sm font-medium text-white/90">Phone Number</Label>
                <Input
                  placeholder="+64 21 123 456"
                  value={signupData.phone}
                  onChange={(e) => setSignupData(prev => ({...prev, phone: e.target.value}))}
                  className="mt-2 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                />
              </div>

              {/* Address */}
              <div>
                <Label className="text-sm font-medium text-white/90">Business Address</Label>
                <Input
                  placeholder="123 Queen St, Auckland"
                  value={signupData.address}
                  onChange={(e) => setSignupData(prev => ({...prev, address: e.target.value}))}
                  className="mt-2 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                />
              </div>

              {/* Password Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-white/90">Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={signupData.password}
                    onChange={(e) => setSignupData(prev => ({...prev, password: e.target.value}))}
                    className="mt-2 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-white/90">Confirm Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={signupData.confirmPassword}
                    onChange={(e) => setSignupData(prev => ({...prev, confirmPassword: e.target.value}))}
                    className="mt-2 px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={signupMutation.isPending}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white py-4 px-6 rounded-xl font-medium transition-all duration-300 disabled:opacity-50 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                {signupMutation.isPending ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Creating Account...</span>
                  </div>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-sm text-white/50">
                By creating an account, you agree to our terms of service
              </p>
            </div>
          </div>
        </div>
      </AnimatedBrandBackground>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden p-4">
      {/* Background Layer - Fixed */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{ backgroundColor: '#00D4D4' }}
      >
        {/* Desktop Only: Lava Lamp Blue Balls */}
        <div className="hidden md:block">
          {/* Lava Lamp Ball 1 - Large */}
          <div 
            className="absolute w-96 h-96 rounded-full animate-lava-lamp-1 bottom-[-100px] right-[-100px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform, border-radius',
            }}
          />
          
          {/* Lava Lamp Ball 2 - Medium */}
          <div 
            className="absolute w-80 h-80 rounded-full animate-lava-lamp-2 top-[-80px] left-[-80px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform, border-radius',
            }}
          />
          
          {/* Lava Lamp Ball 3 - Large */}
          <div 
            className="absolute w-[28rem] h-[28rem] rounded-full animate-lava-lamp-3 top-[20%] right-[10%]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform, border-radius',
            }}
          />
          
          {/* Lava Lamp Ball 4 - Small */}
          <div 
            className="absolute w-64 h-64 rounded-full animate-lava-lamp-4 bottom-[15%] left-[20%]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform, border-radius',
            }}
          />
          
          {/* Lava Lamp Ball 5 - Extra Large */}
          <div 
            className="absolute w-[32rem] h-[32rem] rounded-full animate-lava-lamp-5 top-[40%] left-[-120px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform, border-radius',
            }}
          />
          
          {/* Lava Lamp Ball 6 - Medium */}
          <div 
            className="absolute w-72 h-72 rounded-full animate-lava-lamp-6 bottom-[30%] right-[25%]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform, border-radius',
            }}
          />
        </div>
        
        {/* Mobile: Simple circles (non-morphing) */}
        <div className="block md:hidden">
          <div 
            className="absolute w-96 h-96 rounded-full animate-slow-float-1 bottom-[-120px] right-[-120px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
          <div 
            className="absolute w-48 h-48 rounded-full animate-slow-float-2 bottom-[200px] right-[250px]"
            style={{ 
              backgroundColor: '#0000FF',
              willChange: 'transform',
            }}
          />
        </div>
        
        {/* Floating Line-art Shapes */}
        <svg 
          className="absolute top-[15%] left-[10%] w-12 h-12 animate-float-shape-1" 
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <polygon points="24,4 44,44 4,44" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute top-[70%] left-[80%] w-10 h-10 animate-float-shape-2"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <polygon points="20,4 36,36 4,36" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute top-[25%] right-[15%] w-11 h-11 animate-float-shape-3"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <rect x="4" y="4" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute bottom-[30%] left-[20%] w-9 h-9 animate-float-shape-4"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <rect x="4" y="4" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute top-[60%] right-[25%] w-10 h-10 animate-float-shape-5"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <line x1="6" y1="6" x2="34" y2="34" stroke="currentColor" strokeWidth="2" />
          <line x1="34" y1="6" x2="6" y2="34" stroke="currentColor" strokeWidth="2" />
        </svg>
        
        <svg 
          className="absolute top-[40%] left-[15%] w-12 h-12 animate-float-shape-6"
          style={{ 
            color: 'white', 
            opacity: 0.6,
            willChange: 'transform',
          }}
        >
          <line x1="8" y1="8" x2="40" y2="40" stroke="currentColor" strokeWidth="2" />
          <line x1="40" y1="8" x2="8" y2="40" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>

      {/* Content Layer */}
      <div className="relative z-10 flex min-h-screen items-center justify-center w-full">
        <div className="w-full max-w-xs">
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl">
          
          {/* Logo Section - Compact */}
          <div className="text-center mb-4">
            <div className="flex justify-center mb-3">
              <img 
                src={taptLogoPath} 
                alt="TaptPay" 
                className="h-10 w-auto object-contain"
              />
            </div>
            <h1 className="text-xl font-light text-white mb-1">
              Welcome back
            </h1>
            <p className="text-white/70 text-xs">
              Sign in to continue
            </p>
          </div>

          {/* Login Type Toggle - Compact */}
          <div className="mb-4">
            <div className="flex backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl p-1 shadow-lg">
              <button
                type="button"
                onClick={() => setLoginType('merchant')}
                className={`flex-1 flex items-center justify-center space-x-1 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-300 ${
                  loginType === 'merchant'
                    ? 'backdrop-blur-xl bg-white/15 text-black shadow-md border border-white/30'
                    : 'text-black/70 hover:text-black hover:bg-white/5 hover:backdrop-blur-lg'
                }`}
              >
                <LogIn className="w-3 h-3" />
                <span>Merchant</span>
              </button>
              <button
                type="button"
                onClick={() => setLoginType('admin')}
                className={`flex-1 flex items-center justify-center space-x-1 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-300 ${
                  loginType === 'admin'
                    ? 'backdrop-blur-xl bg-white/15 text-black shadow-md border border-white/30'
                    : 'text-black/70 hover:text-black hover:bg-white/5 hover:backdrop-blur-lg'
                }`}
              >
                <Shield className="w-3 h-3" />
                <span>Admin</span>
              </button>
            </div>
          </div>

          {/* Login Form - Compact */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="space-y-3">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-white/90">
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="demo@tapt.co.nz"
                          className="mt-1 w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-black placeholder-gray-600 text-sm focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-300 text-xs" />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-white/90">
                        Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="demo123"
                          className="mt-1 w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-black placeholder-gray-600 text-sm focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-300 text-xs" />
                    </FormItem>
                  )}
                />
              </div>

              {/* Admin Credentials Info - Compact */}
              {loginType === 'admin' && (
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-2">
                  <p className="text-xs text-white/80 text-center">
                    <span className="font-medium">Admin credentials pre-filled</span>
                  </p>
                </div>
              )}

              {/* Login Button - Compact */}
              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-300 disabled:opacity-50 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                {loginMutation.isPending ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </Form>

          {/* Dropdown Arrow for More Options - Only for merchant login */}
          {loginType === 'merchant' && (
            <div className="mt-4">
              <button
                onClick={() => setShowMoreOptions(!showMoreOptions)}
                className="w-full flex items-center justify-center space-x-1 text-white/70 hover:text-white transition-colors duration-200 py-2 active:scale-95"
              >
                <span className="text-xs">More options</span>
                <div className={`transition-transform duration-300 ${showMoreOptions ? 'rotate-180' : 'rotate-0'}`}>
                  <ChevronDown className="w-3 h-3" />
                </div>
              </button>

              {/* Collapsible More Options with Smooth Animation */}
              <div 
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  showMoreOptions ? 'max-h-32 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'
                }`}
              >
                <div className="space-y-3 border-t border-white/20 pt-3">
                  {/* Forgot Password */}
                  <Link href="/forgot-password">
                    <Button variant="ghost" className="w-full text-xs text-white/70 hover:text-white hover:bg-white/10 py-2">
                      Forgot your password?
                    </Button>
                  </Link>

                  {/* Create Account */}
                  <Button
                    variant="outline"
                    onClick={() => setShowSignup(true)}
                    className="w-full flex items-center justify-center space-x-2 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/40 backdrop-blur-sm rounded-xl transition-all duration-300 py-2 text-xs"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Create New Account</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Footer - Compact */}
          <div className="mt-4 text-center">
            <p className="text-xs text-white/50">
              Need help?{" "}
              <a href="#" className="text-white/70 hover:text-white font-medium transition-colors">
                Contact support
              </a>
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
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
import { LogIn, Shield, UserPlus, Store, ArrowLeft } from "lucide-react";
import taptLogoPath from "@assets/tapt logo v2_1751682549877.png";
import { createMerchantSchema, type CreateMerchant } from "@shared/schema";

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

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: loginType === 'merchant' ? "" : "oliverleonard.professional@gmail.com",
      password: loginType === 'merchant' ? "" : "TAPTpay",
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
    form.setValue("email", loginType === 'merchant' ? "" : "oliverleonard.professional@gmail.com");
    form.setValue("password", loginType === 'merchant' ? "" : "TAPTpay");
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
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        {/* Gradient Background with Floating Orbs */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          {/* Animated Gradient Orbs */}
          <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse"></div>
          <div className="absolute top-40 right-20 w-96 h-96 bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-75"></div>
          <div className="absolute -bottom-8 left-40 w-96 h-96 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-150"></div>
        </div>

        {/* Glass Morphism Container */}
        <div className="relative z-10 w-full max-w-md">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl">
            
            {/* Logo Section */}
            <div className="text-center mb-8">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-white backdrop-blur-lg rounded-2xl flex items-center justify-center border border-white/30 shadow-lg">
                  <span className="text-black font-bold text-xl">T</span>
                </div>
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
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Gradient Background with Floating Orbs */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Animated Gradient Orbs */}
        <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse"></div>
        <div className="absolute top-40 right-20 w-96 h-96 bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-75"></div>
        <div className="absolute -bottom-8 left-40 w-96 h-96 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse delay-150"></div>
      </div>

      {/* Glass Morphism Container */}
      <div className="relative z-10 w-full max-w-md">
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 shadow-2xl">
          
          {/* Logo Section */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-white backdrop-blur-lg rounded-2xl flex items-center justify-center border border-white/30 shadow-lg">
                <span className="text-black font-bold text-xl">T</span>
              </div>
            </div>
            <h1 className="text-2xl font-light text-white mb-2">
              Welcome back
            </h1>
            <p className="text-white/70 text-sm">
              Sign in to continue
            </p>
          </div>

          {/* Login Type Toggle */}
          <div className="mb-6">
            <div className="flex backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-1 shadow-2xl">
              <button
                type="button"
                onClick={() => setLoginType('merchant')}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-sm font-medium transition-all duration-300 ${
                  loginType === 'merchant'
                    ? 'backdrop-blur-xl bg-white/20 text-white shadow-lg border border-white/30'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>Merchant</span>
              </button>
              <button
                type="button"
                onClick={() => setLoginType('admin')}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-sm font-medium transition-all duration-300 ${
                  loginType === 'admin'
                    ? 'backdrop-blur-xl bg-white/20 text-white shadow-lg border border-white/30'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Admin</span>
              </button>
            </div>
          </div>

          {/* Login Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-white/90">
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="demo@tapt.co.nz"
                          className="mt-2 w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-300" />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-white/90">
                        Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="demo123"
                          className="mt-2 w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-white/30 focus:border-white/40 transition-all duration-300"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-300" />
                    </FormItem>
                  )}
                />
              </div>

              {/* Admin Credentials Info */}
              {loginType === 'admin' && (
                <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
                  <p className="text-sm text-white/80 text-center">
                    <span className="font-medium">Admin credentials pre-filled</span>
                  </p>
                </div>
              )}

              {/* Login Button */}
              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white py-4 px-6 rounded-xl font-medium transition-all duration-300 disabled:opacity-50 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                {loginMutation.isPending ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>
            
            {/* Forgot Password Link - Only show for merchant login */}
            {loginType === 'merchant' && (
              <div className="text-center mt-4">
                <Link href="/forgot-password">
                  <Button variant="ghost" className="text-sm text-white/70 hover:text-white">
                    Forgot your password?
                  </Button>
                </Link>
              </div>
            )}
            </form>
          </Form>

          {/* Signup Section - Only show for merchant login */}
          {loginType === 'merchant' && (
            <div className="mt-8 border-t border-white/20 pt-8">
              <div className="text-center space-y-4">
                <p className="text-sm text-white/70">
                  Don't have an account yet?
                </p>
                <Button
                  variant="outline"
                  onClick={() => setShowSignup(true)}
                  className="w-full flex items-center justify-center space-x-2 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/40 backdrop-blur-sm rounded-xl transition-all duration-300"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Create New Account</span>
                </Button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-sm text-white/50">
              Need help?{" "}
              <a href="#" className="text-white/70 hover:text-white font-medium transition-colors">
                Contact support
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
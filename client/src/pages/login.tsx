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
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          
          {/* Logo Section */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <img 
                src={taptLogoPath} 
                alt="Tapt" 
                className="h-12 w-auto"
              />
            </div>
            <h1 className="text-2xl font-light text-gray-900 mb-2">
              Create Your Account
            </h1>
            <p className="text-gray-500 text-sm">
              Join Tapt and start accepting payments
            </p>
          </div>

          {/* Back to Login Button */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setShowSignup(false)}
              className="flex items-center space-x-2 text-gray-600 hover:text-black"
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
            
            {/* Store Name */}
            <div>
              <Label className="text-sm font-medium text-gray-700">Store Name</Label>
              <Input
                placeholder="My Store"
                value={signupData.name}
                onChange={(e) => setSignupData(prev => ({...prev, name: e.target.value}))}
                className="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>

            {/* Business Name */}
            <div>
              <Label className="text-sm font-medium text-gray-700">Business Name</Label>
              <Input
                placeholder="My Business Ltd"
                value={signupData.businessName}
                onChange={(e) => setSignupData(prev => ({...prev, businessName: e.target.value}))}
                className="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>

            {/* Business Type */}
            <div>
              <Label className="text-sm font-medium text-gray-700">Business Type</Label>
              <select
                value={signupData.businessType}
                onChange={(e) => setSignupData(prev => ({...prev, businessType: e.target.value}))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              >
                <option value="">Select business type</option>
                <option value="retail">Retail</option>
                <option value="restaurant">Restaurant</option>
                <option value="cafe">Cafe</option>
                <option value="service">Service</option>
                <option value="online">Online</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Email */}
            <div>
              <Label className="text-sm font-medium text-gray-700">Email Address</Label>
              <Input
                type="email"
                placeholder="you@business.com"
                value={signupData.email}
                onChange={(e) => setSignupData(prev => ({...prev, email: e.target.value}))}
                className="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>

            {/* Phone */}
            <div>
              <Label className="text-sm font-medium text-gray-700">Phone Number</Label>
              <Input
                placeholder="+64 21 123 456"
                value={signupData.phone}
                onChange={(e) => setSignupData(prev => ({...prev, phone: e.target.value}))}
                className="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>

            {/* Address */}
            <div>
              <Label className="text-sm font-medium text-gray-700">Business Address</Label>
              <Input
                placeholder="123 Queen St, Auckland"
                value={signupData.address}
                onChange={(e) => setSignupData(prev => ({...prev, address: e.target.value}))}
                className="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>

            {/* Password Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={signupData.password}
                  onChange={(e) => setSignupData(prev => ({...prev, password: e.target.value}))}
                  className="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700">Confirm Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={signupData.confirmPassword}
                  onChange={(e) => setSignupData(prev => ({...prev, confirmPassword: e.target.value}))}
                  className="mt-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
            </div>

              <Button
                type="submit"
                disabled={signupMutation.isPending}
                className="w-full bg-black hover:bg-gray-800 text-white py-3 px-6 rounded-lg font-medium transition-all disabled:opacity-50"
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
            <p className="text-sm text-gray-400">
              By creating an account, you agree to our terms of service
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        
        {/* Logo Section */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-8">
            <img 
              src={taptLogoPath} 
              alt="Tapt" 
              className="h-12 w-auto"
            />
          </div>
          <h1 className="text-2xl font-light text-gray-900 mb-2">
            Welcome back
          </h1>
          <p className="text-gray-500 text-sm">
            Sign in to continue
          </p>
        </div>

        {/* Login Type Toggle */}
        <div className="mb-6">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setLoginType('merchant')}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-md text-sm font-medium transition-all ${
                loginType === 'merchant'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Merchant Login</span>
            </button>
            <button
              type="button"
              onClick={() => setLoginType('admin')}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-md text-sm font-medium transition-all ${
                loginType === 'admin'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Admin Login</span>
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
                    <FormLabel className="text-sm font-medium text-gray-700">
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="demo@tapt.co.nz"
                        className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="demo123"
                        className="mt-1 w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Admin Credentials Info */}
            {loginType === 'admin' && (
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
                <p className="text-sm text-gray-600 text-center">
                  <span className="font-medium">Admin credentials pre-filled</span>
                </p>
              </div>
            )}

            {/* Login Button */}
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full bg-black hover:bg-gray-800 text-white py-3 px-6 rounded-lg font-medium transition-all disabled:opacity-50"
            >
              {loginMutation.isPending ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </div>
              ) : (
                `Sign in as ${loginType === 'merchant' ? 'Merchant' : 'Admin'}`
              )}
            </Button>
            
            {/* Forgot Password Link - Only show for merchant login */}
            {loginType === 'merchant' && (
              <div className="text-center mt-4">
                <Link href="/forgot-password">
                  <Button variant="ghost" className="text-sm text-gray-600 hover:text-black">
                    Forgot your password?
                  </Button>
                </Link>
              </div>
            )}
          </form>
        </Form>

        {/* Signup Section - Only show for merchant login */}
        {loginType === 'merchant' && (
          <div className="mt-8 border-t border-gray-100 pt-8">
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-600">
                Don't have an account yet?
              </p>
              <Button
                variant="outline"
                onClick={() => setShowSignup(true)}
                className="w-full flex items-center justify-center space-x-2 border-gray-200 hover:border-black hover:bg-gray-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create New Account</span>
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            Need help?{" "}
            <a href="#" className="text-gray-600 hover:text-black font-medium transition-colors">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield } from "lucide-react";
import taptLogoPath from "@assets/tapt logo v2_1751682549877.png";

const adminLoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type AdminLoginFormData = z.infer<typeof adminLoginSchema>;

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<AdminLoginFormData>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: "admin@tapt.co.nz",
      password: "admin123",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: AdminLoginFormData) => {
      const response = await apiRequest("POST", "/api/admin/auth/login", data);
      return response.json();
    },
    onSuccess: (result) => {
      localStorage.setItem("adminAuthToken", result.token);
      localStorage.setItem("adminUser", JSON.stringify(result.user));
      
      toast({
        title: "Admin Access Granted",
        description: "Welcome to the Tapt Admin Dashboard",
      });
      
      setLocation("/admin/dashboard");
    },
    onError: (error: any) => {
      toast({
        title: "Access Denied",
        description: error.message || "Invalid admin credentials. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AdminLoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        
        {/* Logo Section */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <img 
                src={taptLogoPath} 
                alt="Tapt" 
                className="h-8 w-auto"
              />
            </div>
          </div>
          <h1 className="text-2xl font-light text-white mb-2">
            Admin Portal
          </h1>
          <p className="text-slate-300 text-sm flex items-center justify-center gap-2">
            <Shield className="w-4 h-4" />
            Secure administrative access
          </p>
        </div>

        {/* Login Form */}
        <Card className="bg-white/95 backdrop-blur border-0 shadow-xl">
          <CardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Admin Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="admin@tapt.co.nz"
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-slate-800 focus:border-transparent"
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
                          placeholder="admin123"
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-slate-800 focus:border-transparent"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Demo Credentials Info */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-sm text-slate-600 text-center">
                    <span className="font-medium">Demo Admin:</span> admin@tapt.co.nz / admin123
                  </p>
                </div>

                {/* Login Button */}
                <Button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 px-6 rounded-lg font-medium transition-all disabled:opacity-50"
                >
                  {loginMutation.isPending ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Authenticating...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2">
                      <Shield className="w-4 h-4" />
                      <span>Access Admin Panel</span>
                    </div>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Security Notice */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400">
            This area is restricted to authorized administrators only
          </p>
        </div>
      </div>
    </div>
  );
}
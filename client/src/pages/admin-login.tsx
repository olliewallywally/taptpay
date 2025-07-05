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
import { Shield, ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import taptLogoPath from "@assets/tapt logo v2_1751682549877.png";

const adminLoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type AdminLoginFormData = z.infer<typeof adminLoginSchema>;

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();

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
        title: "Login Failed",
        description: error.message || "Invalid admin credentials",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AdminLoginFormData) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className={`w-full ${isMobile ? 'max-w-sm' : 'max-w-md'}`}>
        
        {/* Mobile-optimized Back Button */}
        <div className="flex items-center justify-start mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="text-slate-300 hover:text-white text-sm p-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {!isMobile && "Back to Terminal"}
          </Button>
        </div>
        
        {/* Header */}
        <div className={`text-center ${isMobile ? 'mb-8' : 'mb-12'}`}>
          <div className="flex justify-center mb-4">
            <div className="bg-white p-3 rounded-lg shadow-lg">
              <img 
                src={taptLogoPath} 
                alt="Tapt" 
                className={`${isMobile ? 'h-6' : 'h-8'} w-auto`}
              />
            </div>
          </div>
          <h1 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-light text-white mb-2`}>
            Admin Portal
          </h1>
          <p className={`text-slate-300 ${isMobile ? 'text-xs' : 'text-sm'} flex items-center justify-center gap-2`}>
            <Shield className="w-4 h-4" />
            Secure administrative access
          </p>
        </div>

        {/* Login Form */}
        <Card className="bg-white/95 backdrop-blur border-0 shadow-xl">
          <CardContent className={`${isMobile ? 'p-4' : 'p-6'}`}>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-700`}>
                        Admin Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="admin@tapt.co.nz"
                          className={`w-full ${isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-3'} border border-gray-200 rounded-lg focus:ring-2 focus:ring-slate-800 focus:border-transparent`}
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
                      <FormLabel className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium text-gray-700`}>
                        Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          className={`w-full ${isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-3'} border border-gray-200 rounded-lg focus:ring-2 focus:ring-slate-800 focus:border-transparent`}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className={`w-full ${isMobile ? 'py-2 px-3 text-sm' : 'py-3 px-4'} bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-50`}
                >
                  {loginMutation.isPending ? "Signing in..." : (isMobile ? "Access Portal" : "Access Admin Portal")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        
      </div>
      </div>
    </div>
  );
}
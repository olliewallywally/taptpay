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
      
      setLocation("/admin");
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
    <div className="min-h-screen relative overflow-hidden">
      {/* Dynamic Moving Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-800">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-purple-900/20 via-transparent to-blue-900/20 animate-gradient-x"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-l from-gray-800/30 via-transparent to-gray-700/30 animate-gradient-y"></div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen p-3 sm:p-4">
        <div className={`w-full ${isMobile ? 'max-w-sm' : 'max-w-md'}`}>
        
        {/* Mobile-optimized Back Button */}
        <div className="flex items-center justify-start mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="text-white/70 hover:text-white text-sm p-2 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {!isMobile && "Back to Terminal"}
          </Button>
        </div>
        
        {/* Header */}
        <div className={`text-center ${isMobile ? 'mb-8' : 'mb-12'}`}>
          <div className="flex justify-center mb-4">
            <div className="backdrop-blur-sm bg-white/90 p-3 rounded-xl shadow-2xl border border-white/20">
              <img 
                src={taptLogoPath} 
                alt="Tapt" 
                className={`${isMobile ? 'h-6' : 'h-8'} w-auto`}
              />
            </div>
          </div>
          <h1 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-white mb-2`}>
            Admin Portal
          </h1>
          <p className={`text-white/70 ${isMobile ? 'text-xs' : 'text-sm'} flex items-center justify-center gap-2`}>
            <Shield className="w-4 h-4 text-blue-400" />
            Secure administrative access
          </p>
        </div>

        {/* Login Form */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl">
          <div className={`${isMobile ? 'p-4' : 'p-6'}`}>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium text-white`}>
                        Admin Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="admin@tapt.co.nz"
                          className={`w-full ${isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-3'} backdrop-blur-sm bg-white/5 border border-white/15 text-white placeholder:text-white/60 focus:bg-white/8 focus:border-white/20 rounded-xl`}
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
                      <FormLabel className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium text-white`}>
                        Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          className={`w-full ${isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-3'} backdrop-blur-sm bg-white/5 border border-white/15 text-white placeholder:text-white/60 focus:bg-white/8 focus:border-white/20 rounded-xl`}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-red-300" />
                    </FormItem>
                  )}
                />
                
                <Button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className={`w-full ${isMobile ? 'py-2 px-3 text-sm' : 'py-3 px-4'} backdrop-blur-sm bg-gradient-to-r from-blue-500/80 via-blue-600/80 to-blue-500/80 border border-blue-400/50 text-white hover:from-blue-400/90 hover:via-blue-500/90 hover:to-blue-400/90 hover:border-blue-300/60 rounded-xl transition-all duration-300 font-medium disabled:opacity-50`}
                >
                  {loginMutation.isPending ? "Signing in..." : (isMobile ? "Access Portal" : "Access Admin Portal")}
                </Button>
              </form>
            </Form>
          </div>
        </div>
        
      </div>
      </div>
    </div>
  );
}
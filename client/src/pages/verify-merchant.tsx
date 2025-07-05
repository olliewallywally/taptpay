import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { verifyMerchantSchema, type VerifyMerchant } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Shield, Lock } from "lucide-react";

export default function VerifyMerchant() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [verifiedMerchant, setVerifiedMerchant] = useState<any>(null);

  const form = useForm<VerifyMerchant>({
    resolver: zodResolver(verifyMerchantSchema),
    defaultValues: {
      token: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Extract token from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      form.setValue('token', tokenParam);
    }
  }, [form]);

  const verifyMerchantMutation = useMutation({
    mutationFn: async (data: VerifyMerchant) => {
      const response = await apiRequest("POST", "/api/verify-merchant", data);
      return response.json();
    },
    onSuccess: (data) => {
      setVerifiedMerchant(data.merchant);
      setIsSuccess(true);
      toast({
        title: "Account Verified",
        description: "You can now log in to your merchant account",
      });
      // Redirect to login after 3 seconds
      setTimeout(() => {
        setLocation("/login");
      }, 3000);
    },
    onError: (error: any) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Failed to verify account",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VerifyMerchant) => {
    verifyMerchantMutation.mutate(data);
  };

  if (!token) {
    return (
      <div className="container mx-auto p-6 max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-red-600">Invalid Verification Link</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-gray-600">
              The verification link appears to be invalid or expired. Please contact support for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess && verifiedMerchant) {
    return (
      <div className="container mx-auto p-6 max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Account Verified!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <h3 className="font-semibold mb-2">Welcome to Tapt</h3>
              <p className="text-sm text-gray-600">
                Your merchant account for <strong>{verifiedMerchant.businessName}</strong> has been successfully verified.
              </p>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2 text-blue-900">Next Steps</h3>
              <p className="text-sm text-blue-700">
                You will be redirected to the login page in a few seconds, or you can click the button below to log in now.
              </p>
            </div>

            <Button 
              onClick={() => setLocation("/login")}
              className="w-full"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-md">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Complete Your Registration</CardTitle>
          <p className="text-gray-600 mt-2">
            Create a password to activate your Tapt merchant account
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your password"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Confirm your password"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center text-sm text-gray-600">
                  <Lock className="w-4 h-4 mr-2" />
                  Your password must be at least 6 characters long
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={verifyMerchantMutation.isPending}
              >
                {verifyMerchantMutation.isPending ? (
                  "Verifying..."
                ) : (
                  "Complete Registration"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
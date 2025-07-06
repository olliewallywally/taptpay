import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { createMerchantSchema, type CreateMerchant } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Store, Mail, Lock } from "lucide-react";

export default function MerchantSignup() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const form = useForm<CreateMerchant>({
    resolver: zodResolver(createMerchantSchema),
    defaultValues: {
      name: "",
      businessName: "",
      businessType: "",
      email: "",
      phone: "",
      address: "",
      password: "",
      confirmPassword: "",
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: CreateMerchant) => {
      const response = await apiRequest("POST", "/api/merchants/signup", data);
      return response.json();
    },
    onSuccess: (data) => {
      setSubmittedEmail(form.getValues("email"));
      setIsSuccess(true);
      toast({
        title: "Account Created Successfully",
        description: "Please check your email to verify your account",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Signup Failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateMerchant) => {
    signupMutation.mutate(data);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-green-600">Check Your Email!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <div className="flex items-center justify-center mb-2">
                  <Mail className="w-5 h-5 text-blue-600 mr-2" />
                  <span className="font-medium">Verification Email Sent</span>
                </div>
                <p className="text-sm text-gray-600">
                  We've sent a verification email to:
                </p>
                <p className="text-sm font-medium text-blue-600 mt-1">
                  {submittedEmail}
                </p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2 text-blue-900">Next Steps</h3>
                <ol className="text-sm text-blue-700 space-y-1">
                  <li>1. Check your email inbox</li>
                  <li>2. Click the verification link</li>
                  <li>3. Complete your password setup</li>
                  <li>4. Start accepting payments!</li>
                </ol>
              </div>

              <div className="flex space-x-2">
                <Button 
                  variant="outline"
                  onClick={() => setLocation("/")}
                  className="flex-1"
                >
                  Back to Home
                </Button>
                <Button 
                  onClick={() => setLocation("/login")}
                  className="flex-1"
                >
                  Login
                </Button>
              </div>
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
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Store Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Legal Business Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="businessType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select business type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="retail">Retail Store</SelectItem>
                          <SelectItem value="restaurant">Restaurant/Cafe</SelectItem>
                          <SelectItem value="service">Service Business</SelectItem>
                          <SelectItem value="online">Online Business</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="your@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+64 21 123 456" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="Business Address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Create password" {...field} />
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
                        <Input type="password" placeholder="Confirm password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center text-sm text-gray-600">
                    <Lock className="w-4 h-4 mr-2" />
                    By signing up, you agree to our terms and privacy policy
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={signupMutation.isPending}
                >
                  {signupMutation.isPending ? (
                    "Creating Account..."
                  ) : (
                    "Create Merchant Account"
                  )}
                </Button>
              </form>
            </Form>

            <div className="text-center mt-4">
              <p className="text-sm text-gray-600">
                Already have an account?{" "}
                <button
                  onClick={() => setLocation("/login")}
                  className="text-blue-600 hover:underline"
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
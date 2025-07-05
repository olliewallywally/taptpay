import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { LogIn } from "lucide-react";
import taptLogoPath from "@assets/tapt logo_1751676012286.png";
import taptPayLogoPath from "@assets/tapt pay_1751676012286.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate login process
    setTimeout(() => {
      setIsLoading(false);
      setLocation("/merchant");
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white shadow-2xl border-0">
        <CardContent className="p-8">
          {/* Logo Section */}
          <div className="text-center mb-8">
            <div className="mb-6 space-y-4">
              {/* Main Tapt Logo */}
              <div className="flex justify-center">
                <img 
                  src={taptLogoPath} 
                  alt="Tapt" 
                  className="h-16 w-auto filter brightness-0 saturate-100"
                  style={{ filter: 'invert(20%) sepia(50%) saturate(500%) hue-rotate(120deg) brightness(95%)' }}
                />
              </div>
              
              {/* Tapt Pay Logo */}
              <div className="flex justify-center">
                <img 
                  src={taptPayLogoPath} 
                  alt="Tapt Pay" 
                  className="h-12 w-auto filter brightness-0 saturate-100"
                  style={{ filter: 'invert(50%) sepia(30%) saturate(200%) hue-rotate(25deg) brightness(120%)' }}
                />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-green-800 mb-2">
              Welcome Back
            </h1>
            <p className="text-gray-600">
              Sign in to your payment terminal
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="merchant@business.com"
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-800 focus:border-transparent transition-all"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-800 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-green-800 focus:ring-green-800 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 text-sm text-gray-600">
                  Remember me
                </label>
              </div>
              <a href="#" className="text-sm text-amber-600 hover:text-amber-700 transition-colors">
                Forgot password?
              </a>
            </div>

            {/* Login Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-800 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-semibold text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing In...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <LogIn className="w-5 h-5" />
                  <span>Sign In</span>
                </div>
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Don't have an account?{" "}
              <a href="#" className="text-amber-600 hover:text-amber-700 font-medium transition-colors">
                Contact Sales
              </a>
            </p>
          </div>

          {/* Security Badge */}
          <div className="mt-6 flex items-center justify-center space-x-4 text-xs text-gray-400">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Secure Login</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>PCI Compliant</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { 
  QrCode, 
  Smartphone, 
  Shield, 
  Zap, 
  TrendingUp, 
  Users,
  CheckCircle,
  ArrowRight,
  Store,
  CreditCard,
  Clock
} from "lucide-react";
import taptLogoPath from "@assets/IMG_6592_1755070818452.png";

export default function Landing() {
  const handleGetStarted = () => {
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <img 
              src={taptLogoPath} 
              alt="TaptPay" 
              className="h-8 w-auto object-contain"
            />
          </div>
          <div className="flex items-center space-x-6">
            <a href="#features" className="text-slate-300 hover:text-white transition-colors">Features</a>
            <a href="#business" className="text-slate-300 hover:text-white transition-colors">For Business</a>
            <Button 
              onClick={handleGetStarted}
              className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-2"
            >
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-6xl md:text-8xl font-bold text-white mb-6 leading-tight">
            IT PAYS<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
              TO TAPT
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-3xl mx-auto">
            The smarter way for merchants to accept payments –<br />
            <span className="text-cyan-400 font-semibold">without the complexity</span>
          </p>
          <Button 
            onClick={handleGetStarted}
            size="lg"
            className="bg-cyan-500 hover:bg-cyan-600 text-white px-8 py-4 text-lg font-semibold mb-8"
          >
            START ACCEPTING PAYMENTS
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          
          <div className="mt-16">
            <div className="relative max-w-4xl mx-auto">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-3xl p-8">
                <div className="grid md:grid-cols-3 gap-8 items-center">
                  <div className="text-center">
                    <QrCode className="h-16 w-16 text-cyan-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">QR CODE PAYMENTS</h3>
                    <p className="text-slate-300">Customers scan to pay instantly</p>
                  </div>
                  <div className="text-center">
                    <Smartphone className="h-16 w-16 text-blue-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">NFC TAP TO PAY</h3>
                    <p className="text-slate-300">Support for all contactless payments</p>
                  </div>
                  <div className="text-center">
                    <TrendingUp className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">REAL-TIME ANALYTICS</h3>
                    <p className="text-slate-300">Track sales and revenue live</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              The new way is <span className="text-cyan-400">scan to pay</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
              <CardContent className="p-8 text-center">
                <Clock className="h-12 w-12 text-cyan-400 mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-white mb-4">Instant Setup</h3>
                <p className="text-slate-300">
                  Get your payment terminal running in minutes. No complex hardware or lengthy onboarding process.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
              <CardContent className="p-8 text-center">
                <Shield className="h-12 w-12 text-blue-400 mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-white mb-4">Bank-Level Security</h3>
                <p className="text-slate-300">
                  Your transactions are protected with enterprise-grade security and encryption protocols.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
              <CardContent className="p-8 text-center">
                <Zap className="h-12 w-12 text-emerald-400 mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-white mb-4">Lightning Fast</h3>
                <p className="text-slate-300">
                  Process payments in seconds with real-time updates and instant confirmations.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Business Benefits */}
      <section className="py-20 px-4 bg-slate-900/50">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">
                Built for modern businesses
              </h2>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <CheckCircle className="h-6 w-6 text-cyan-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">Lower Transaction Fees</h3>
                    <p className="text-slate-300">Save money with competitive processing rates and transparent pricing.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <CheckCircle className="h-6 w-6 text-cyan-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">Stock Management Integration</h3>
                    <p className="text-slate-300">Manage inventory and track sales all in one seamless platform.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <CheckCircle className="h-6 w-6 text-cyan-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">Real-Time Analytics</h3>
                    <p className="text-slate-300">Make data-driven decisions with live sales insights and reporting.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <CheckCircle className="h-6 w-6 text-cyan-400 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">Multi-Payment Support</h3>
                    <p className="text-slate-300">Accept QR codes, NFC, Apple Pay, Google Pay, and contactless cards.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-3xl p-8 border border-cyan-500/30">
                <div className="bg-slate-900 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Store className="h-8 w-8 text-cyan-400" />
                    <span className="text-slate-400 text-sm">Live Dashboard</span>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-white">Today's Sales</span>
                      <span className="text-emerald-400 font-bold">$2,847.50</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white">Transactions</span>
                      <span className="text-cyan-400 font-bold">147</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white">Avg. Transaction</span>
                      <span className="text-blue-400 font-bold">$19.37</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Business CTA Section */}
      <section id="business" className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            HEY BUSINESS OWNERS!
          </h2>
          <p className="text-xl text-slate-300 mb-12 max-w-4xl mx-auto">
            We see you. And we think payments should be awesome for businesses too. 
            Think smarter payments, lower fees, and analytics so detailed, 
            you'll have insights before your coffee gets cold.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <Card className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
              <CardContent className="p-8 text-center">
                <CreditCard className="h-12 w-12 text-cyan-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Lower Fees</h3>
                <p className="text-slate-300">Competitive rates that grow with your business</p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/30">
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Customer Insights</h3>
                <p className="text-slate-300">Understand your customers like never before</p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/30">
              <CardContent className="p-8 text-center">
                <TrendingUp className="h-12 w-12 text-indigo-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Growth Tools</h3>
                <p className="text-slate-300">Built-in tools to help your business scale</p>
              </CardContent>
            </Card>
          </div>

          <Button 
            onClick={handleGetStarted}
            size="lg"
            className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-12 py-4 text-lg font-semibold"
          >
            LEVEL UP YOUR BUSINESS
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 bg-gradient-to-r from-cyan-600 to-blue-600">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            READY TO <span className="text-cyan-100">TRANSFORM</span> PAYMENTS?
          </h2>
          <p className="text-xl text-cyan-100 mb-8">
            Join hundreds of businesses already using TaptPay
          </p>
          <Button 
            onClick={handleGetStarted}
            size="lg"
            className="bg-white text-blue-600 hover:bg-slate-100 px-12 py-4 text-lg font-semibold"
          >
            GET STARTED TODAY
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 py-12 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <img 
                src={taptLogoPath} 
                alt="TaptPay" 
                className="h-8 w-auto object-contain mb-4"
              />
              <p className="text-slate-400">
                The future of merchant payments
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">For Merchants</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API Docs</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-8 pt-8 text-center">
            <p className="text-slate-400">© 2025 TaptPay. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
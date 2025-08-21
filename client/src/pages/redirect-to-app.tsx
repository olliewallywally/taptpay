import { useEffect } from 'react';

export default function RedirectToApp() {
  useEffect(() => {
    // Redirect to the web app
    window.location.href = "https://taptpay.online/login";
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white">Redirecting to TaptPay App...</p>
      </div>
    </div>
  );
}
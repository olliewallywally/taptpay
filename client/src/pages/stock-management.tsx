import { useIsMobile } from "@/hooks/use-mobile";

export default function StockManagement() {
  const isMobile = useIsMobile();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900">
      <div className="container mx-auto px-3 sm:px-4 pb-4 sm:pb-8 pt-6">
        <h1 className="text-3xl font-bold text-white">Stock Management - Debug Mode</h1>
        <p className="text-white/70">Stock page temporarily simplified for JSX debugging</p>
      </div>
    </div>
  );
}
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getCurrentMerchantId } from "@/lib/auth";
import { z } from "zod";
import QRCode from 'qrcode';
import { 
  Building, 
  CreditCard, 
  Cog, 
  CheckCircle, 
  AlertCircle, 
  Shield, 
  Key, 
  Download, 
  QrCode,
  Copy,
  Check,
  Smartphone,
  Users,
  Tag,
  Settings as SettingsIcon,
  Edit,
  Save,
  X,
  Coins,
  UserCheck,
  Star,
  Crown,
  Zap,
  DollarSign,
  TrendingUp,
  Mail,
  Phone,
  MapPin
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";





export default function Settings() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900">
      <div className="container mx-auto px-3 sm:px-4 pb-4 sm:pb-8 pt-6">
        <h1 className="text-3xl font-bold text-white">Settings - Debug Mode</h1>
        <p className="text-white/70">Settings page temporarily simplified for JSX debugging</p>
      </div>
    </div>
  );
}
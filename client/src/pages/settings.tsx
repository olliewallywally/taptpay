import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { isNativeApp, isNativeIOS } from "@/lib/native";
import { Switch } from "@/components/ui/switch";
import { 
  Upload, CheckCircle, XCircle, LogOut, AlertCircle, Bell, BellOff, ChevronDown, Printer, ArrowRight
} from "lucide-react";

function SettingsSection({ title, isOpen, onToggle, children }: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl mb-5 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 sm:px-6 py-5 text-left"
      >
        <h2 className="text-[#0055FF] text-xl font-medium">{title}</h2>
        <ChevronDown
          size={20}
          className="text-[#0055FF] shrink-0 ml-2"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s ease',
          }}
        />
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.3s ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div className="px-5 sm:px-6 pb-5 sm:pb-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MerchantDetails {
  businessName: string;
  director: string;
  address: string;
  nzbn: string;
  phone: string;
  email: string;
  gstNumber: string;
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const merchantId = getCurrentMerchantId();

  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [businessDetails, setBusinessDetails] = useState<MerchantDetails>({
    businessName: '',
    director: '',
    address: '',
    nzbn: '',
    phone: '',
    email: '',
    gstNumber: '',
  });

  const [windcaveApi, setWindcaveApi] = useState('');
  const [apiActive, setApiActive] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [dailyGoal, setDailyGoal] = useState('500');
  
  // Subscription state
  const [billingFrequency, setBillingFrequency] = useState('monthly');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // Billing card state
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardSaving, setCardSaving] = useState(false);
  const [cardRemoving, setCardRemoving] = useState(false);

  // Push notification state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [vapidAvailable, setVapidAvailable] = useState(true);

  useEffect(() => {
    if (isNativeIOS()) {
      setPushSupported(true);
      fetch('/api/push/capabilities')
        .then(r => r.json())
        .then(caps => {
          setVapidAvailable(!!caps?.nativePush?.available);
          checkNativePushStatus();
        })
        .catch(() => {
          setVapidAvailable(false);
        });
    } else {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      setPushSupported(supported);
      if (supported) {
        fetch('/api/push/capabilities')
          .then(r => r.json())
          .then(caps => {
            const webReady = !!caps?.webPush?.available;
            setVapidAvailable(webReady);
            if (webReady) checkPushStatus();
          })
          .catch(() => setVapidAvailable(false));
      }
    }
  }, []);

  async function checkNativePushStatus() {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const { receive } = await PushNotifications.checkPermissions();
      if (receive !== 'granted') {
        setPushEnabled(false);
        return;
      }
      const token = localStorage.getItem("authToken");
      if (token) {
        const statusResp = await fetch('/api/push/status', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (statusResp.ok) {
          const status = await statusResp.json();
          setPushEnabled(!!status.nativeSubscribed);
          return;
        }
      }
      setPushEnabled(true);
    } catch {
      setPushSupported(false);
    }
  }

  async function checkPushStatus() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushEnabled(!!subscription);
    } catch {
      setPushEnabled(false);
    }
  }

  async function togglePushNotifications(enable: boolean) {
    if (isNativeIOS()) {
      return toggleNativePushNotifications(enable);
    }
    return toggleWebPushNotifications(enable);
  }

  async function toggleNativePushNotifications(enable: boolean) {
    setPushLoading(true);
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      if (enable) {
        const permStatus = await PushNotifications.requestPermissions();
        if (permStatus.receive !== 'granted') {
          toast({ title: "Notification permission denied", description: "Please enable in iOS Settings > TaptPay", variant: "destructive" });
          setPushLoading(false);
          return;
        }
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Registration timed out')), 15000);
          const regHandle = PushNotifications.addListener('registration', async (token) => {
            clearTimeout(timer);
            regHandle.then(h => h.remove());
            errHandle.then(h => h.remove());
            try {
              const authToken = localStorage.getItem("authToken");
              const resp = await fetch('/api/push/native-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ deviceToken: token.value }),
              });
              if (resp.ok) {
                setPushEnabled(true);
                toast({ title: "Notifications enabled", description: "You'll receive alerts for transaction updates" });
                resolve();
              } else {
                reject(new Error("Server rejected device token"));
              }
            } catch (e) { reject(e); }
          });
          const errHandle = PushNotifications.addListener('registrationError', async (err) => {
            clearTimeout(timer);
            regHandle.then(h => h.remove());
            errHandle.then(h => h.remove());
            reject(new Error(err.error));
          });
          PushNotifications.register();
        });
      } else {
        const authToken = localStorage.getItem("authToken");
        const unsubResp = await fetch('/api/push/native-unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        });
        if (!unsubResp.ok) {
          throw new Error("Server failed to remove notification subscription");
        }
        setPushEnabled(false);
        toast({ title: "Notifications disabled" });
      }
    } catch (error) {
      console.error("Native push toggle error:", error);
      toast({ title: "Failed to update notification settings", variant: "destructive" });
    }
    setPushLoading(false);
  }

  async function toggleWebPushNotifications(enable: boolean) {
    setPushLoading(true);
    try {
      if (enable) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast({ title: "Notification permission denied", description: "Please enable notifications in your browser settings", variant: "destructive" });
          setPushLoading(false);
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const vapidResponse = await fetch('/api/push/vapid-key');
        if (!vapidResponse.ok) {
          setVapidAvailable(false);
          throw new Error("VAPID key unavailable — push notifications not configured on server");
        }
        const { publicKey } = await vapidResponse.json();
        if (!publicKey) throw new Error("Invalid VAPID public key received from server");

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        const token = localStorage.getItem("authToken");
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });

        if (!response.ok) {
          await subscription.unsubscribe();
          throw new Error("Server rejected subscription");
        }

        setPushEnabled(true);
        toast({ title: "Notifications enabled", description: "You'll receive alerts for transaction updates" });
      } else {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();

          const token = localStorage.getItem("authToken");
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ endpoint }),
          });
        }

        setPushEnabled(false);
        toast({ title: "Notifications disabled" });
      }
    } catch (error) {
      console.error("Push notification toggle error:", error);
      toast({ title: "Failed to update notification settings", variant: "destructive" });
    }
    setPushLoading(false);
  }

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  if (!merchantId) {
    setLocation('/login');
    return null;
  }

  const { data: merchant, isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch merchant");
      const data = await response.json();
      setBusinessDetails({
        businessName: data.businessName || '',
        director: data.director || '',
        address: data.address || '',
        nzbn: data.nzbn || '',
        phone: data.phone || '',
        email: data.email || '',
        gstNumber: data.gstNumber || '',
      });
      setWindcaveApi(data.windcaveApiKey || '');
      setApiActive(!!data.windcaveApiKey);
      setDailyGoal(data.dailyGoal || '500.00');
      if (data.customLogoUrl) {
        setLogoPreview(data.customLogoUrl);
      }
      return data;
    },
  });

  const updateMerchantMutation = useMutation({
    mutationFn: async (details: MerchantDetails & { windcaveApiKey?: string }) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(details),
      });
      if (!response.ok) throw new Error("Failed to update merchant");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      toast({ title: "Business details saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save business details", variant: "destructive" });
    },
  });

  const updateDailyGoalMutation = useMutation({
    mutationFn: async (goalAmount: string) => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/daily-goal`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ dailyGoal: goalAmount }),
      });
      if (!response.ok) throw new Error("Failed to update daily goal");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      toast({ title: "Daily goal updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update daily goal", variant: "destructive" });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = localStorage.getItem("authToken");
      const formData = new FormData();
      formData.append('logo', file);
      
      const response = await fetch(`/api/merchants/${merchantId}/logo`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to upload logo");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      setLogoFile(null);
      setLogoPreview(null);
      toast({ title: "Logo uploaded successfully" });
    },
    onError: () => {
      toast({ title: "Failed to upload logo", variant: "destructive" });
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/logo`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete logo");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId] });
      setLogoPreview(null);
      toast({ title: "Logo deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete logo", variant: "destructive" });
    },
  });

  // Fetch subscription data
  const { data: subscriptionData } = useQuery({
    queryKey: ["/api/subscription"],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/subscription');
      if (!response.ok) throw new Error("Failed to fetch subscription");
      return response.json();
    },
  });

  useEffect(() => {
    if (subscriptionData?.subscription) {
      setBillingFrequency(subscriptionData.subscription.billingFrequency || 'monthly');
    }
  }, [subscriptionData]);

  const updateBillingFrequencyMutation = useMutation({
    mutationFn: async (frequency: string) => {
      const response = await apiRequest('PUT', '/api/subscription/billing-frequency', { frequency });
      if (!response.ok) throw new Error("Failed to update billing frequency");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: "Billing frequency updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update billing frequency", variant: "destructive" });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (reason: string) => {
      const response = await apiRequest('POST', '/api/subscription/cancel', { reason });
      if (!response.ok) throw new Error("Failed to cancel subscription");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      setShowCancelDialog(false);
      setCancellationReason('');
      toast({ title: "Subscription cancellation requested. Will be effective in 30 days." });
    },
    onError: () => {
      toast({ title: "Failed to cancel subscription", variant: "destructive" });
    },
  });

  const handleBusinessChange = (field: keyof MerchantDetails, value: string) => {
    setBusinessDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveDetails = () => {
    updateMerchantMutation.mutate(businessDetails);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'image/png') {
        toast({ title: "Please upload a PNG file only", variant: "destructive" });
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: "File size must be less than 20MB", variant: "destructive" });
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApiSave = () => {
    if (windcaveApi.trim()) {
      updateMerchantMutation.mutate({ ...businessDetails, windcaveApiKey: windcaveApi });
      setApiActive(true);
    } else {
      toast({ title: "Please enter an API key", variant: "destructive" });
    }
  };

  const handleUploadLogo = () => {
    if (logoFile) {
      uploadLogoMutation.mutate(logoFile);
    }
  };

  const handleDeleteLogo = () => {
    deleteLogoMutation.mutate();
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setLocation('/login');
  };

  const handleBillingFrequencyChange = (frequency: string) => {
    setBillingFrequency(frequency);
    updateBillingFrequencyMutation.mutate(frequency);
  };

  const handleCancelSubscription = () => {
    if (!cancellationReason.trim()) {
      toast({ title: "Please provide a reason for cancellation", variant: "destructive" });
      return;
    }
    cancelSubscriptionMutation.mutate(cancellationReason);
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 19);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
    return digits;
  };

  const handleSaveCard = async () => {
    const rawNumber = cardNumber.replace(/\s/g, '');
    if (rawNumber.length < 13 || rawNumber.length > 19) {
      toast({ title: "Please enter a valid card number", variant: "destructive" });
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
      toast({ title: "Please enter expiry in MM/YY format", variant: "destructive" });
      return;
    }
    if (cardCvc.length < 3) {
      toast({ title: "Please enter a valid CVC", variant: "destructive" });
      return;
    }
    setCardSaving(true);
    try {
      const authToken = localStorage.getItem("authToken");
      const resp = await fetch('/api/billing/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ cardNumber: rawNumber, expiry: cardExpiry, cvc: cardCvc }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || 'Failed to save card');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/merchants', merchantId] });
      setShowCardForm(false);
      setCardNumber('');
      setCardExpiry('');
      setCardCvc('');
      toast({ title: "Card saved successfully" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to save card";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setCardSaving(false);
    }
  };

  const handleRemoveCard = async () => {
    setCardRemoving(true);
    try {
      const authToken = localStorage.getItem("authToken");
      const resp = await fetch('/api/billing/card', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (!resp.ok) throw new Error('Failed to remove card');
      queryClient.invalidateQueries({ queryKey: ['/api/merchants', merchantId] });
      toast({ title: "Card removed" });
    } catch {
      toast({ title: "Failed to remove card", variant: "destructive" });
    } finally {
      setCardRemoving(false);
    }
  };

  const subscription = subscriptionData?.subscription;
  const transactionProgress = subscription ? Math.min((subscription.currentMonthTransactions / 100) * 100, 100) : 0;
  const isFreeTier = subscription?.tier === 'free';
  const isCancelled = subscription?.status === 'cancelled';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-200 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0055FF] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 pb-24">
      {/* Header */}
      <div className="bg-[#0055FF] pt-8 pb-6 rounded-b-[60px] sm:rounded-b-[100px]">
        <div className="max-w-md mx-auto px-4 sm:px-6">
          <h1 className="text-[#00E5CC] text-center text-2xl sm:text-3xl">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 sm:px-6 mt-8">
        {/* Payment Board Builder Shortcut */}
        <button
          onClick={() => setLocation('/board-builder')}
          className="w-full bg-white rounded-2xl sm:rounded-3xl p-5 flex items-center justify-between mb-5 transition-all hover:shadow-md text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-[#0055FF]/10 flex items-center justify-center flex-shrink-0">
              <Printer className="w-5 h-5 text-[#0055FF]" />
            </div>
            <div>
              <div className="text-[#0055FF] font-medium text-lg leading-tight">Payment Board Builder</div>
              <div className="text-gray-400 text-sm mt-0.5">Design & print your custom payment sign</div>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-[#0055FF]/60 flex-shrink-0 ml-3" />
        </button>

        {/* Business Details Section */}
        <SettingsSection title="Business Details" isOpen={openSections.has('business')} onToggle={() => toggle('business')}>
          <div className="space-y-4 mt-1">
            <div>
              <Label htmlFor="businessName" className="!text-[#0055FF] font-semibold text-base mb-2 block">Company Name</Label>
              <Input
                id="businessName"
                value={businessDetails.businessName}
                onChange={(e) => handleBusinessChange('businessName', e.target.value)}
                className="!border-2 !border-[#0055FF] focus:!border-[#00E5CC] focus:!ring-[#00E5CC]"
                data-testid="input-business-name"
              />
            </div>

            <div>
              <Label htmlFor="director" className="!text-[#0055FF] font-semibold text-base mb-2 block">Director</Label>
              <Input
                id="director"
                value={businessDetails.director}
                onChange={(e) => handleBusinessChange('director', e.target.value)}
                className="!border-2 !border-[#0055FF] focus:!border-[#00E5CC] focus:!ring-[#00E5CC]"
                data-testid="input-director"
              />
            </div>

            <div>
              <Label htmlFor="address" className="!text-[#0055FF] font-semibold text-base mb-2 block">Address</Label>
              <Input
                id="address"
                value={businessDetails.address}
                onChange={(e) => handleBusinessChange('address', e.target.value)}
                className="!border-2 !border-[#0055FF] focus:!border-[#00E5CC] focus:!ring-[#00E5CC]"
                data-testid="input-address"
              />
            </div>

            <div>
              <Label htmlFor="nzbn" className="!text-[#0055FF] font-semibold text-base mb-2 block">NZBN</Label>
              <Input
                id="nzbn"
                value={businessDetails.nzbn}
                onChange={(e) => handleBusinessChange('nzbn', e.target.value)}
                className="!border-2 !border-[#0055FF] focus:!border-[#00E5CC] focus:!ring-[#00E5CC]"
                data-testid="input-nzbn"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="!text-[#0055FF] font-semibold text-base mb-2 block">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={businessDetails.phone}
                onChange={(e) => handleBusinessChange('phone', e.target.value)}
                className="!border-2 !border-[#0055FF] focus:!border-[#00E5CC] focus:!ring-[#00E5CC]"
                data-testid="input-phone"
              />
            </div>

            <div>
              <Label htmlFor="email" className="!text-[#0055FF] font-semibold text-base mb-2 block">Email</Label>
              <Input
                id="email"
                type="email"
                value={businessDetails.email}
                onChange={(e) => handleBusinessChange('email', e.target.value)}
                className="!border-2 !border-[#0055FF] focus:!border-[#00E5CC] focus:!ring-[#00E5CC]"
                data-testid="input-email"
              />
            </div>

            <div>
              <Label htmlFor="gstNumber" className="!text-[#0055FF] font-semibold text-base mb-2 block">GST Number</Label>
              <Input
                id="gstNumber"
                value={businessDetails.gstNumber}
                onChange={(e) => handleBusinessChange('gstNumber', e.target.value)}
                className="!border-2 !border-[#0055FF] focus:!border-[#00E5CC] focus:!ring-[#00E5CC]"
                data-testid="input-gst-number"
              />
            </div>
          </div>

          <Button 
            className="w-full bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF] mt-5"
            onClick={handleSaveDetails}
            disabled={updateMerchantMutation.isPending}
            data-testid="button-save"
          >
            {updateMerchantMutation.isPending ? "Saving..." : "Save Business Details"}
          </Button>
        </SettingsSection>

        {/* API Status Section */}
        <SettingsSection title="API Status" isOpen={openSections.has('api')} onToggle={() => toggle('api')}>
          <div className="space-y-4 mt-1">
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="windcaveApi" className="text-gray-700 text-sm">Windcave API Key</Label>
                {apiActive ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="text-green-500" size={20} />
                    <span className="text-green-500 text-sm">Active</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="text-gray-400" size={20} />
                    <span className="text-gray-400 text-sm">Inactive</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  id="windcaveApi"
                  type="password"
                  value={windcaveApi}
                  onChange={(e) => setWindcaveApi(e.target.value)}
                  placeholder="Enter Windcave API key"
                  className="border-[#0055FF] focus:border-[#00E5CC] focus:ring-[#00E5CC] flex-1"
                  data-testid="input-windcave-api"
                />
                <Button 
                  onClick={handleApiSave}
                  className="bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF]"
                  data-testid="button-save-api"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Logo Upload Section */}
        <SettingsSection title="Customer Payment Page Logo" isOpen={openSections.has('logo')} onToggle={() => toggle('logo')}>
          <div className="space-y-4 mt-1">
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">Upload Logo (PNG only, max 20MB)</Label>
              <div className="border-2 border-dashed border-[#0055FF] rounded-xl p-6 text-center">
                {logoPreview ? (
                  <div className="space-y-3">
                    <img src={logoPreview} alt="Logo preview" className="max-h-32 mx-auto" />
                    {logoFile && <p className="text-sm text-gray-600">{logoFile.name}</p>}
                    <div className="flex gap-2 justify-center">
                      {logoFile ? (
                        <>
                          <Button
                            onClick={handleUploadLogo}
                            disabled={uploadLogoMutation.isPending}
                            className="bg-[#00E5CC] hover:bg-[#00c9b3] text-[#0055FF]"
                          >
                            {uploadLogoMutation.isPending ? "Uploading..." : "Upload"}
                          </Button>
                          <Button
                            onClick={() => {
                              setLogoFile(null);
                              setLogoPreview(merchant?.customLogoUrl || null);
                            }}
                            variant="outline"
                            className="border-[#0055FF] text-[#0055FF]"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={handleDeleteLogo}
                          disabled={deleteLogoMutation.isPending}
                          variant="outline"
                          className="border-red-500 text-red-500 hover:bg-red-50"
                        >
                          {deleteLogoMutation.isPending ? "Deleting..." : "Delete Logo"}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="mx-auto text-[#0055FF]" size={48} />
                    <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                    <input
                      type="file"
                      accept=".png"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload"
                    />
                    <Button
                      onClick={() => document.getElementById('logo-upload')?.click()}
                      variant="outline"
                      className="border-[#0055FF] text-[#0055FF]"
                    >
                      Choose File
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Dashboard Preferences Section */}
        <SettingsSection title="Dashboard Preferences" isOpen={openSections.has('preferences')} onToggle={() => toggle('preferences')}>
          <div className="space-y-4 mt-1">
            <div>
              <Label htmlFor="dailyGoal" className="text-gray-700 text-sm mb-1.5 block">
                Daily Revenue Goal ($)
              </Label>
              <p className="text-xs text-gray-500 mb-2">
                Set your daily revenue target. This is used in the "active transactions" section on your dashboard.
              </p>
              <div className="flex gap-3">
                <Input
                  id="dailyGoal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(e.target.value)}
                  className="flex-1"
                  placeholder="500.00"
                  data-testid="input-daily-goal"
                />
                <Button
                  onClick={() => updateDailyGoalMutation.mutate(dailyGoal)}
                  disabled={updateDailyGoalMutation.isPending}
                  className="bg-[#0055FF] hover:bg-[#0055FF]/90"
                  data-testid="button-save-daily-goal"
                >
                  {updateDailyGoalMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Subscription & Billing Section */}
        {isNativeApp() ? (
          <div className="bg-white rounded-2xl sm:rounded-3xl mb-5 overflow-hidden">
            <div className="px-5 sm:px-6 py-5">
              <h2 className="text-[#0055FF] text-xl font-medium mb-4">Subscription & Billing</h2>
              <div className="p-5 bg-[#0055FF]/5 rounded-xl text-center space-y-3">
                <p className="text-gray-700 text-sm leading-relaxed">
                  To add or update your payment method, visit
                </p>
                <a
                  href="https://taptpay.co.nz/settings"
                  className="text-[#0055FF] font-semibold text-base underline block"
                >
                  taptpay.co.nz
                </a>
              </div>
            </div>
          </div>
        ) : (
        <SettingsSection title="Subscription & Billing" isOpen={openSections.has('billing')} onToggle={() => toggle('billing')}>
          <div className="space-y-5 mt-1">
            {/* Current Tier */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#0055FF]/10 to-[#00E5CC]/10 rounded-xl">
              <div>
                <p className="text-gray-700 font-medium">Current Plan</p>
                <p className="text-2xl font-bold text-[#0055FF] mt-1">
                  {isFreeTier ? 'Free Tier' : 'Paid ($19.99/month)'}
                </p>
              </div>
              {isCancelled && (
                <AlertCircle className="text-orange-500" size={24} />
              )}
            </div>

            {/* Transaction Counter */}
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-700 font-medium">Monthly Transaction Usage</p>
                <p className="text-sm font-medium text-gray-600">
                  {subscription?.currentMonthTransactions || 0} / 100
                </p>
              </div>
              <Progress value={transactionProgress} className="h-3 mb-2" />
              <p className="text-xs text-gray-500">
                {isFreeTier 
                  ? 'Free tier includes up to 100 transactions per month. Additional charges of $0.10 per transaction apply after that.'
                  : 'You will be charged 10 cents per transaction at your selected billing frequency.'}
              </p>
              {isFreeTier && subscription && subscription.currentMonthTransactions >= 100 && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600 font-medium">
                    ⚠️ You've reached your free tier limit. Your card will be charged $0.10 per additional transaction.
                  </p>
                </div>
              )}
            </div>

            {/* Billing Frequency */}
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">
                Transaction Fee Billing Frequency
              </Label>
              <p className="text-xs text-gray-500 mb-3">
                Choose how often you want to be charged for transaction fees (10 cents per transaction)
              </p>
              <Select value={billingFrequency} onValueChange={handleBillingFrequencyChange}>
                <SelectTrigger className="border-[#0055FF] focus:border-[#00E5CC]" data-testid="select-billing-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Unbilled Transactions */}
            {subscription && subscription.unbilledTransactionCount > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Unbilled Transactions
                </p>
                <p className="text-xs text-blue-700">
                  {subscription.unbilledTransactionCount} transactions totaling ${Number(subscription.unbilledAmount).toFixed(2)} will be charged on your next billing date
                </p>
              </div>
            )}

            {/* Billing Card */}
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">Payment Card</Label>
              <div className="p-3 mb-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800 font-medium">
                  Payment processing coming soon via Windcave. Saving your card details now will allow automatic billing once the integration goes live.
                </p>
              </div>
              {merchant?.billingCardLast4 && !showCardForm ? (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-7 bg-white border border-gray-300 rounded flex items-center justify-center">
                      <span className="text-[9px] font-bold text-gray-600">{merchant.billingCardBrand?.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {merchant.billingCardBrand} ending in {merchant.billingCardLast4}
                      </p>
                      <p className="text-xs text-gray-500">Expires {merchant.billingCardExpiry}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCardForm(true)}
                      className="text-xs"
                    >
                      Replace
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRemoveCard}
                      disabled={cardRemoving}
                      className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                    >
                      {cardRemoving ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </div>
              ) : showCardForm || !merchant?.billingCardLast4 ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">Card Number</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="1234 5678 9012 3456"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      className="border-[#0055FF] focus:border-[#00E5CC] font-mono"
                      maxLength={23}
                      data-testid="input-card-number"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-600 mb-1 block">Expiry (MM/YY)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                        className="border-[#0055FF] focus:border-[#00E5CC] font-mono"
                        maxLength={5}
                        data-testid="input-card-expiry"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600 mb-1 block">CVC</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="123"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="border-[#0055FF] focus:border-[#00E5CC] font-mono"
                        maxLength={4}
                        data-testid="input-card-cvc"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {showCardForm && (
                      <Button
                        variant="outline"
                        onClick={() => { setShowCardForm(false); setCardNumber(''); setCardExpiry(''); setCardCvc(''); }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      onClick={handleSaveCard}
                      disabled={cardSaving}
                      className="flex-1 bg-[#0055FF] hover:bg-[#0044CC] text-white"
                      data-testid="button-save-card"
                    >
                      {cardSaving ? "Saving..." : "Save Card"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Cancellation Section */}
            {!isCancelled ? (
              !showCancelDialog ? (
                <Button
                  variant="outline"
                  className="w-full border-red-500 text-red-500 hover:bg-red-50"
                  onClick={() => setShowCancelDialog(true)}
                  data-testid="button-cancel-subscription"
                >
                  Cancel Subscription
                </Button>
              ) : (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                  <p className="text-sm font-medium text-red-900">
                    Cancel Subscription (30-day notice required)
                  </p>
                  <p className="text-xs text-red-700">
                    Your subscription will remain active for 30 days after cancellation request. Please provide a reason:
                  </p>
                  <Textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="Please tell us why you're cancelling..."
                    className="border-red-300 focus:border-red-500"
                    data-testid="textarea-cancel-reason"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCancelDialog(false);
                        setCancellationReason('');
                      }}
                      className="flex-1"
                    >
                      Keep Subscription
                    </Button>
                    <Button
                      onClick={handleCancelSubscription}
                      disabled={cancelSubscriptionMutation.isPending || !cancellationReason.trim()}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                      data-testid="button-confirm-cancel"
                    >
                      {cancelSubscriptionMutation.isPending ? "Processing..." : "Confirm Cancellation"}
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <p className="text-sm font-medium text-orange-900 mb-1">
                  Subscription Cancelled
                </p>
                <p className="text-xs text-orange-700">
                  Your subscription will end on {subscription?.cancellationEffectiveDate ? new Date(subscription.cancellationEffectiveDate).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            )}
          </div>
        </SettingsSection>
        )}

        {/* Account Section */}
        <SettingsSection title="Account" isOpen={openSections.has('account')} onToggle={() => toggle('account')}>
          <div className="space-y-3 mt-1">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-gray-700 font-medium">Account Status</p>
                <p className="text-gray-500 text-sm">Your merchant account is active</p>
              </div>
              <CheckCircle className="text-green-500" size={24} />
            </div>
          </div>
        </SettingsSection>

        {/* Push Notifications */}
        <SettingsSection title="Transaction Notifications" isOpen={openSections.has('notifications')} onToggle={() => toggle('notifications')}>
          <div className="mt-1">
            {pushSupported ? (
              !vapidAvailable ? (
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <BellOff className="text-amber-500 shrink-0 mt-0.5" size={18} />
                  <p className="text-sm text-amber-700">
                    Push notifications are not yet configured. Please contact support to enable this feature.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">
                      {pushEnabled 
                        ? "You'll receive alerts when payments are received, failed, or refunded" 
                        : "Enable to get real-time alerts for transaction updates"}
                    </p>
                  </div>
                  <Switch
                    checked={pushEnabled}
                    onCheckedChange={togglePushNotifications}
                    disabled={pushLoading}
                    className="ml-4"
                  />
                </div>
              )
            ) : (
              <p className="text-sm text-gray-500">Push notifications are not supported in this browser.</p>
            )}
          </div>
        </SettingsSection>

        {/* Customer Payment Page Button */}
        <div className="mb-5">
          <Button
            onClick={() => setLocation(`/pay/${merchantId}`)}
            className="w-full bg-[#0055FF] hover:bg-[#0044dd] text-[#00E5CC] py-6 rounded-2xl text-lg"
            data-testid="button-customer-page"
          >
            Customer Payment Page
          </Button>
        </div>

        {/* Logout Button */}
        <div className="mb-8">
          <Button
            onClick={handleLogout}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-6 rounded-2xl text-lg flex items-center justify-center gap-2"
            data-testid="button-logout"
          >
            <LogOut size={20} />
            Log Out
          </Button>
        </div>
      </div>
    </div>
  );
}

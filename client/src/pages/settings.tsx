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
import { TRADES_THEME } from "@/lib/trades-theme";
import { Switch } from "@/components/ui/switch";
import { WireframeLiquidButton } from "@/components/wireframe-liquid-button";
import { useTutorial } from "@/features/tutorial/tutorial";
import { 
  Upload, CheckCircle, XCircle, LogOut, AlertCircle, Bell, BellOff, ChevronDown, Printer, ArrowRight, CreditCard, Building2, Wrench, BookOpen, RotateCcw
} from "lucide-react";

function SettingsSection({ title, isOpen, onToggle, children, delay = 0 }: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="pt-bounce bg-white mb-4 overflow-hidden transition-shadow"
      style={{ '--pt-d': `${delay}ms`, borderRadius: 22, boxShadow: isOpen ? '0 10px 30px rgba(4,13,109,0.10)' : '0 4px 14px rgba(4,13,109,0.08)' } as any}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 sm:px-6 py-5 text-left"
      >
        <h2 style={{ fontWeight: 600, fontSize: 17, color: '#040D6D', letterSpacing: '-0.01em' }}>{title}</h2>
        <div
          style={{
            width: 30, height: 30, borderRadius: 999, flexShrink: 0, marginLeft: 8,
            background: isOpen ? '#040D6D' : 'rgba(4,13,109,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.25s ease',
          }}
        >
          <ChevronDown
            size={17}
            style={{
              color: isOpen ? '#58ABFF' : '#040D6D',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s ease, color 0.25s ease',
            }}
          />
        </div>
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
  const {
    restartTutorials,
    visitedPages: tutorialVisitedPages,
    pageCount: tutorialPageCount,
    isRestarting: tutorialRestarting,
    canRestart: tutorialReady,
  } = useTutorial();

  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("section") === "billing") {
      setOpenSections(previous => new Set(previous).add("billing"));
    }
  }, []);

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
  const [vapidAvailable, setVapidAvailable] = useState(false);

  const [gstRegistered, setGstRegistered] = useState(false);
  const [tradeGstMode, setTradeGstMode] = useState<"inclusive" | "exclusive">("inclusive");

  useEffect(() => {
    apiRequest("GET", "/api/trades/gst-settings")
      .then(r => r.json())
      .then(data => {
        setGstRegistered(!!data.gstRegistered);
        setTradeGstMode(data.tradeGstMode === "exclusive" ? "exclusive" : "inclusive");
      })
      .catch(() => {});
  }, []);

  const saveGst = (patch: { gstRegistered?: boolean; tradeGstMode?: "inclusive" | "exclusive" }) => {
    if (patch.gstRegistered !== undefined) setGstRegistered(patch.gstRegistered);
    if (patch.tradeGstMode) setTradeGstMode(patch.tradeGstMode);
    apiRequest("PUT", "/api/trades/gst-settings", patch).catch(() => {
      toast({ title: "Could not save GST setting", variant: "destructive" });
    });
  };

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

  const { data: billingCardStatus } = useQuery<{
    ready: boolean;
    card: { last4: string; brand: string; expiry: string } | null;
  }>({
    queryKey: ["/api/billing/card"],
  });

  useEffect(() => {
    if (!isLoading && new URLSearchParams(window.location.search).get("section") === "billing") {
      requestAnimationFrame(() => {
        document.querySelector('[data-settings-section="billing"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [isLoading]);

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

  const handleRestartTutorials = async () => {
    const confirmed = window.confirm(
      "Restart all page tutorials? Settings will begin now, and every other tutorial will appear as you visit that page.",
    );
    if (!confirmed) return;
    try {
      await restartTutorials();
      setOpenSections(previous => new Set(previous).add("tutorial"));
      toast({
        title: "Tutorials restarted",
        description: "Open each page normally to see its tutorial again.",
      });
    } catch (error) {
      toast({
        title: "Could not restart tutorials",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/billing/card'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/billing/card'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] }),
      ]);
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
      <div style={{ background: '#FFFFFF', minHeight: '100svh', display: 'flex', justifyContent: 'center' }}>
        <div className="flex items-center justify-center" style={{ width: '100%', maxWidth: 430, minHeight: '100svh', background: '#F4F4F4' }}>
          <div className="w-8 h-8 border-2 border-[#040D6D] border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  const businessName = merchant?.businessName || businessDetails.businessName || 'Your Business';
  const initials = businessName.trim().split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'B';
  const statusActive = merchant?.status === 'active';

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100svh', display: 'flex', justifyContent: 'center' }}>
    <div className="pb-32" style={{ width: '100%', maxWidth: 430, minHeight: '100svh', background: '#F4F4F4', fontFamily: "'Outfit', system-ui, sans-serif" }}>

      {/* Navy hero — full-bleed with the app's rounded-bottom sheet edge */}
      <div style={{ background: '#040D6D', borderRadius: '0 0 28px 28px', padding: '64px 22px 28px' }}>
        <div className="pt-bounce" style={{ '--pt-d': '0ms', display: 'flex', alignItems: 'center', gap: 16 } as any}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: '#58ABFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 20, color: '#040D6D' }}>{initials}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#FFFFFF', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {businessName}
            </div>
            <div style={{ fontWeight: 500, fontSize: 11, color: '#58ABFF', letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 3 }}>
              settings
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 10, background: statusActive ? 'rgba(19,194,154,0.18)' : 'rgba(255,176,46,0.20)', color: statusActive ? '#13C29A' : '#FFB02E', fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: statusActive ? '#13C29A' : '#FFB02E', flexShrink: 0 }} />
            {statusActive ? 'active' : 'pending'}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px 18px 0' }}>
        {/* Payment Board Builder Shortcut */}
        <button
          onClick={() => setLocation('/board-builder')}
          className="pt-bounce w-full bg-white p-5 flex items-center justify-between mb-4 transition-all hover:shadow-lg text-left"
          style={{ '--pt-d': '90ms', borderRadius: 22, boxShadow: '0 4px 14px rgba(4,13,109,0.08)' } as any}
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(4,13,109,0.08)' }}>
              <Printer className="w-5 h-5" style={{ color: '#040D6D' }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16, color: '#040D6D', lineHeight: 1.2 }}>Payment Board Builder</div>
              <div className="text-gray-400 text-sm mt-0.5">Design & print your custom payment sign</div>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 flex-shrink-0 ml-3" style={{ color: 'rgba(4,13,109,0.5)' }} />
        </button>

        {/* Business Details Section */}
        <SettingsSection title="Business Details" delay={140} isOpen={openSections.has('business')} onToggle={() => toggle('business')}>
          <div className="space-y-4 mt-1">
            <div>
              <Label htmlFor="businessName" className="!text-[#040D6D] font-semibold text-base mb-2 block">Company Name</Label>
              <Input
                id="businessName"
                value={businessDetails.businessName}
                onChange={(e) => handleBusinessChange('businessName', e.target.value)}
                className="!border !border-gray-200 focus:!border-[#040D6D] focus:!ring-[#040D6D]"
                data-testid="input-business-name"
              />
            </div>

            <div>
              <Label htmlFor="director" className="!text-[#040D6D] font-semibold text-base mb-2 block">Director</Label>
              <Input
                id="director"
                value={businessDetails.director}
                onChange={(e) => handleBusinessChange('director', e.target.value)}
                className="!border !border-gray-200 focus:!border-[#040D6D] focus:!ring-[#040D6D]"
                data-testid="input-director"
              />
            </div>

            <div>
              <Label htmlFor="address" className="!text-[#040D6D] font-semibold text-base mb-2 block">Address</Label>
              <Input
                id="address"
                value={businessDetails.address}
                onChange={(e) => handleBusinessChange('address', e.target.value)}
                className="!border !border-gray-200 focus:!border-[#040D6D] focus:!ring-[#040D6D]"
                data-testid="input-address"
              />
            </div>

            <div>
              <Label htmlFor="nzbn" className="!text-[#040D6D] font-semibold text-base mb-2 block">NZBN</Label>
              <Input
                id="nzbn"
                value={businessDetails.nzbn}
                onChange={(e) => handleBusinessChange('nzbn', e.target.value)}
                className="!border !border-gray-200 focus:!border-[#040D6D] focus:!ring-[#040D6D]"
                data-testid="input-nzbn"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="!text-[#040D6D] font-semibold text-base mb-2 block">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={businessDetails.phone}
                onChange={(e) => handleBusinessChange('phone', e.target.value)}
                className="!border !border-gray-200 focus:!border-[#040D6D] focus:!ring-[#040D6D]"
                data-testid="input-phone"
              />
            </div>

            <div>
              <Label htmlFor="email" className="!text-[#040D6D] font-semibold text-base mb-2 block">Email</Label>
              <Input
                id="email"
                type="email"
                value={businessDetails.email}
                onChange={(e) => handleBusinessChange('email', e.target.value)}
                className="!border !border-gray-200 focus:!border-[#040D6D] focus:!ring-[#040D6D]"
                data-testid="input-email"
              />
            </div>

            <div>
              <Label htmlFor="gstNumber" className="!text-[#040D6D] font-semibold text-base mb-2 block">GST Number</Label>
              <Input
                id="gstNumber"
                value={businessDetails.gstNumber}
                onChange={(e) => handleBusinessChange('gstNumber', e.target.value)}
                className="!border !border-gray-200 focus:!border-[#040D6D] focus:!ring-[#040D6D]"
                data-testid="input-gst-number"
              />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="font-semibold text-base block" style={{ color: TRADES_THEME.INK }}>GST registered (Trades)</Label>
                  <p className="text-sm text-gray-500 mt-1">Show GST on trades quotes and invoices.</p>
                </div>
                <Switch
                  checked={gstRegistered}
                  onCheckedChange={(value) => saveGst({ gstRegistered: value })}
                  data-testid="switch-gst-registered"
                />
              </div>
              {gstRegistered && (
                <div className="mt-4">
                  <Label className="font-semibold text-sm block mb-2" style={{ color: TRADES_THEME.INK }}>Quote prices shown as</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["inclusive", "exclusive"] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => saveGst({ tradeGstMode: mode })}
                        className="rounded-xl py-2 text-sm font-semibold transition-colors"
                        style={{ background: tradeGstMode === mode ? TRADES_THEME.INK : "#F3F4F6", color: tradeGstMode === mode ? TRADES_THEME.OFFW : "#4B5563" }}
                        data-testid={`button-gst-mode-${mode}`}
                      >
                        {mode === "inclusive" ? "Incl GST" : "+ GST"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <WireframeLiquidButton
            onClick={handleSaveDetails}
            busy={updateMerchantMutation.isPending}
            accent="#040D6D"
            filledTextColor="#58ABFF"
            style={{ width: '100%', marginTop: 20, padding: '12px 27px', fontSize: 14 }}
            data-testid="button-save"
          >
            {updateMerchantMutation.isPending ? "Saving..." : "Save Business Details"}
          </WireframeLiquidButton>
        </SettingsSection>

        {/* Dashboard Preferences Section */}
        <SettingsSection title="Dashboard Preferences" delay={185} isOpen={openSections.has('preferences')} onToggle={() => toggle('preferences')}>
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
                <WireframeLiquidButton
                  onClick={() => updateDailyGoalMutation.mutate(dailyGoal)}
                  busy={updateDailyGoalMutation.isPending}
                  accent="#040D6D"
                  filledTextColor="#58ABFF"
                  style={{ padding: '10px 20px', fontSize: 13 }}
                  data-testid="button-save-daily-goal"
                >
                  {updateDailyGoalMutation.isPending ? "Saving..." : "Save"}
                </WireframeLiquidButton>
              </div>
            </div>
          </div>
        </SettingsSection>

        {/* Subscription & Billing Section */}
        {isNativeApp() ? (
          <div className="pt-bounce bg-white mb-4 overflow-hidden" style={{ '--pt-d': '230ms', borderRadius: 22, boxShadow: '0 4px 14px rgba(4,13,109,0.08)' } as any}>
            <div className="px-5 sm:px-6 py-5">
              <h2 style={{ fontWeight: 600, fontSize: 17, color: '#040D6D', letterSpacing: '-0.01em' }} className="mb-4">Subscription &amp; Billing</h2>
              <div className="p-5 rounded-xl text-center space-y-3" style={{ background: 'rgba(4,13,109,0.05)' }}>
                <p className="text-gray-700 text-sm leading-relaxed">
                  To add or update your payment method, visit
                </p>
                <a
                  href="https://taptpay.co.nz/settings"
                  className="font-semibold text-base underline block"
                  style={{ color: '#040D6D' }}
                >
                  taptpay.co.nz
                </a>
              </div>
            </div>
          </div>
        ) : (
        <div data-settings-section="billing">
        <SettingsSection title="Subscription & Billing" delay={230} isOpen={openSections.has('billing')} onToggle={() => toggle('billing')}>
          <div className="space-y-5 mt-1">
            {/* Current Tier */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#040D6D]/10 to-[#58ABFF]/12 rounded-xl">
              <div>
                <p className="text-gray-700 font-medium">Current Plan</p>
                <p className="text-2xl font-bold text-[#040D6D] mt-1">
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
                <SelectTrigger className="border-gray-200 focus:border-[#040D6D]" data-testid="select-billing-frequency">
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
                  A valid credit or debit card is required before you can send any payment request. Only masked card details are retained.
                </p>
              </div>
              {billingCardStatus?.card && !billingCardStatus.ready && (
                <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700 font-medium">
                    This card is expired or no longer valid for payment requests. Please replace it.
                  </p>
                </div>
              )}
              {billingCardStatus?.card && !showCardForm ? (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-7 bg-white border border-gray-300 rounded flex items-center justify-center">
                      <span className="text-[9px] font-bold text-gray-600">{billingCardStatus.card.brand.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {billingCardStatus.card.brand} ending in {billingCardStatus.card.last4}
                      </p>
                      <p className="text-xs text-gray-500">Expires {billingCardStatus.card.expiry}</p>
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
              ) : showCardForm || !billingCardStatus?.card ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-gray-600 mb-1 block">Card Number</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="1234 5678 9012 3456"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      className="border-gray-200 focus:border-[#040D6D] font-mono"
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
                        className="border-gray-200 focus:border-[#040D6D] font-mono"
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
                        className="border-gray-200 focus:border-[#040D6D] font-mono"
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
                      className="flex-1 bg-[#040D6D] hover:bg-[#0a1580] text-[#58ABFF]"
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
        </div>
        )}

        {/* Account Section */}
        <SettingsSection title="Account" delay={275} isOpen={openSections.has('account')} onToggle={() => toggle('account')}>
          <div className="space-y-3 mt-1">
            <div className={`flex items-center justify-between p-4 rounded-xl ${merchant?.status === 'active' ? 'bg-green-50' : 'bg-amber-50 border border-amber-200'}`}>
              <div>
                <p className="text-gray-700 font-medium">Account Status</p>
                {merchant?.status === 'active' ? (
                  <p className="text-green-600 text-sm font-medium">Active — fully connected to payment network</p>
                ) : merchant?.status === 'verified' ? (
                  <p className="text-amber-600 text-sm">Pending — being reviewed for Windcave onboarding</p>
                ) : (
                  <p className="text-amber-600 text-sm capitalize">{merchant?.status ?? 'Pending'} — contact support if you need help</p>
                )}
              </div>
              {merchant?.status === 'active' ? (
                <CheckCircle className="text-green-500 shrink-0" size={24} />
              ) : (
                <AlertCircle className="text-amber-500 shrink-0" size={24} />
              )}
            </div>
          </div>
        </SettingsSection>

        {/* Push Notifications */}
        <SettingsSection title="Transaction Notifications" delay={320} isOpen={openSections.has('notifications')} onToggle={() => toggle('notifications')}>
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

        <div data-tutorial-id="settings-tutorial-help">
          <SettingsSection title="Tutorial & Help" delay={350} isOpen={openSections.has('tutorial')} onToggle={() => toggle('tutorial')}>
            <div className="mt-1">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(88,171,255,0.16)' }}>
                  <BookOpen size={21} style={{ color: '#040D6D' }} />
                </div>
                <div>
                  <p className="font-semibold text-[#040D6D]">Page-by-page walkthroughs</p>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                    Tutorials appear only when you open each page. They never move you between pages or change your data.
                  </p>
                </div>
              </div>

              <div className="mt-5 p-4 rounded-2xl" style={{ background: 'rgba(4,13,109,0.05)' }}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-sm font-medium text-[#040D6D]">Tutorial progress</span>
                  <span className="text-xs font-semibold text-[#58ABFF]">
                    {tutorialVisitedPages} of {tutorialPageCount || 20} pages introduced
                  </span>
                </div>
                <Progress value={tutorialPageCount ? (tutorialVisitedPages / tutorialPageCount) * 100 : 0} className="h-2" />
              </div>

              <Button
                type="button"
                onClick={handleRestartTutorials}
                disabled={!tutorialReady || tutorialRestarting}
                className="w-full mt-4 bg-[#58ABFF] hover:bg-[#73B9FF] text-[#040D6D] py-6 rounded-2xl font-semibold flex items-center justify-center gap-2"
                data-testid="button-restart-tutorials"
              >
                <RotateCcw size={18} className={tutorialRestarting ? "animate-spin" : ""} />
                {tutorialRestarting ? "Restarting..." : tutorialVisitedPages ? "Restart Tutorials" : "Start Tutorials"}
              </Button>
            </div>
          </SettingsSection>
        </div>

        {/* Customer Payment Page Button */}
        <div className="pt-bounce mb-5" style={{ '--pt-d': '365ms' } as any}>
          <Button
            onClick={() => setLocation(`/pay/${merchantId}`)}
            className="w-full bg-[#040D6D] hover:bg-[#0a1580] text-[#58ABFF] py-6 rounded-2xl text-lg"
            data-testid="button-customer-page"
          >
            Customer Payment Page
          </Button>
        </div>

        {/* Mode switcher: Retail · Property · Trades */}
        <div className="pt-bounce mb-5 flex" style={{ '--pt-d': '405ms', gap: 8 } as any}>
          <button
            onClick={() => setLocation('/dashboard')}
            style={{ flex: 1, background: '#0055FF', borderRadius: 16, padding: '14px 10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(0,229,204,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#00E5CC" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h10M4 17h7"/><rect x="14" y="13" width="7" height="7" rx="1.5"/></svg>
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#00E5CC', letterSpacing: '-0.2px' }}>Retail</div>
              <div style={{ fontWeight: 400, fontSize: 10, color: 'rgba(0,229,204,0.65)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>terminal · sales</div>
            </div>
          </button>
          <button
            onClick={() => setLocation('/property')}
            style={{ flex: 1, background: '#040D6D', borderRadius: 16, padding: '14px 10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(88,171,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#58ABFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20V9.5z"/><path d="M9 21.5V14h6v7.5"/></svg>
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#FFFFFF', letterSpacing: '-0.2px' }}>Property</div>
              <div style={{ fontWeight: 400, fontSize: 10, color: 'rgba(88,171,255,0.65)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>tenants · rent</div>
            </div>
          </button>
          <button
            onClick={() => setLocation('/trades')}
            style={{ flex: 1, background: TRADES_THEME.INK, borderRadius: 16, padding: '14px 10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(244,244,244,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={TRADES_THEME.OFFW} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 00-5.4 5.4l-6 6a1.5 1.5 0 002.1 2.1l6-6a4 4 0 005.4-5.4l-2.3 2.3-2.1-2.1z"/></svg>
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: TRADES_THEME.OFFW, letterSpacing: '-0.2px' }}>Trades</div>
              <div style={{ fontWeight: 400, fontSize: 10, color: 'rgba(244,244,244,0.72)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>quotes · jobs</div>
            </div>
          </button>
        </div>

        {/* Logout Button */}
        <div className="pt-bounce mb-8" style={{ '--pt-d': '445ms' } as any}>
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
    </div>
  );
}

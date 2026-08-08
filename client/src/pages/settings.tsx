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
import { apiErrorMessage } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";
import { isNativeApp } from "@/lib/native";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import {
  BILLING_CARD_SESSION_KEY,
  useBillingCardReturn,
} from "@/hooks/use-billing-card-return";
import { TRADES_THEME } from "@/lib/trades-theme";
import { Switch } from "@/components/ui/switch";
import { WireframeLiquidButton } from "@/components/wireframe-liquid-button";
import { useTutorial } from "@/features/tutorial/tutorial";
import { PLAN_LIST, formatPlanPrice, planForOrDefault, type PlanId } from "@shared/plans";
import {
  cardSetupBillingDisclosure,
  hasPaidCurrentSubscriptionPeriod,
  planChangeBillingDisclosure,
  subscriptionCancellationState,
} from "@/lib/subscription-ui";

interface TeamMember {
  id: number;
  email: string;
  name: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
}

interface BillingHistoryEntry {
  id: number;
  billingType: string;
  amount: string | number;
  status: string;
  description: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string | null;
}

interface AuthMeResponse {
  user: {
    id: number;
    email: string;
    role: string;
  };
}

const billingMoney = (value: string | number) =>
  new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" })
    .format(Number(value) || 0);

const billingDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
  : "—";

const BILLING_TYPE_LABELS: Record<string, string> = {
  monthly_subscription: "Monthly subscription",
  plan_change: "Plan change",
  transaction_fees: "Legacy transaction fees",
  tier_upgrade: "Legacy tier upgrade",
};

const billingTypeLabel = (value: string) =>
  BILLING_TYPE_LABELS[value] ?? value.replace(/_/g, " ");
import { 
  Upload, CheckCircle, XCircle, LogOut, AlertCircle, Bell, BellOff, ChevronDown, Printer, ArrowRight, CreditCard, Building2, Wrench, BookOpen, RotateCcw
} from "lucide-react";

function SettingsSection({ title, isOpen, onToggle, children, delay = 0, anchor }: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  delay?: number;
  anchor?: string;
}) {
  return (
    <div
      data-tutorial-id={anchor}
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
  const { confirmingCard } = useBillingCardReturn();
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
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // Team invites
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  // Billing card state. The card itself is entered on Windcave's hosted page —
  // no PAN, expiry or CVC is ever held in this component.
  const [cardSaving, setCardSaving] = useState(false);
  const [cardRemoving, setCardRemoving] = useState(false);

  const {
    enabled: pushEnabled,
    loading: pushLoading,
    supported: pushSupported,
    available: vapidAvailable,
    toggle: togglePushNotifications,
  } = usePushNotifications();

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

  if (!merchantId) {
    setLocation('/login');
    return null;
  }

  const { data: merchant, isLoading } = useQuery({
    queryKey: ["/api/merchants", merchantId, "profile"],
    queryFn: async () => {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/merchants/${merchantId}/profile`, {
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
      setWindcaveApi('');
      setApiActive(!!data.windcaveApiConfigured);
      setDailyGoal(data.dailyGoal || '500.00');
      if (data.customLogoUrl) {
        setLogoPreview(data.customLogoUrl);
      }
      return data;
    },
  });

  const { data: authData } = useQuery<AuthMeResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/auth/me");
      if (!response.ok) throw new Error("Failed to load account access");
      return response.json();
    },
  });
  const isOwner = authData?.user?.role === "owner" || authData?.user?.role === "admin";

  const { data: billingCardStatus } = useQuery<{
    ready: boolean;
    card: { last4: string; brand: string | null; expiry: string | null } | null;
  }>({
    queryKey: ["/api/billing/card"],
    enabled: isOwner,
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
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "profile"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "profile"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "profile"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/merchants", merchantId, "profile"] });
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

  const subscription = subscriptionData?.subscription;
  const currentPlan = planForOrDefault(subscription?.planId);

  const {
    data: teamData,
    isLoading: teamLoading,
    error: teamError,
  } = useQuery<{ members: TeamMember[]; seatLimit: number; seatsInUse: number }>({
    queryKey: ["/api/team"],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/team');
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to fetch team");
      return body;
    },
    enabled: isOwner && currentPlan.id !== "solo",
  });

  const {
    data: billingHistoryData,
    isLoading: billingHistoryLoading,
    error: billingHistoryError,
  } = useQuery<{ history: BillingHistoryEntry[] }>({
    queryKey: ["/api/subscription/billing-history"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/subscription/billing-history?limit=12");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to load billing history");
      return body;
    },
    enabled: isOwner,
  });

  const refreshBilling = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    queryClient.invalidateQueries({ queryKey: ["/api/subscription/billing-history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/team"] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing/card"] });
  };

  // Reads the server's message so a refused downgrade explains itself ("Crew ->
  // Solo needs 1 login; you have 4") instead of showing a generic failure.
  const changePlanMutation = useMutation({
    mutationFn: async (planId: PlanId) => {
      const response = await apiRequest('PUT', '/api/subscription/plan', { planId });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to change plan");
      return body;
    },
    onSuccess: (data: any) => {
      refreshBilling();
      toast({ title: data?.message || "Plan updated" });
    },
    onError: (error: unknown) => {
      toast({ title: apiErrorMessage(error, "Failed to change plan"), variant: "destructive" });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async (reason: string) => {
      const response = await apiRequest('POST', '/api/subscription/cancel', { reason });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to cancel subscription");
      return body;
    },
    onSuccess: (data: any) => {
      refreshBilling();
      setShowCancelDialog(false);
      setCancellationReason('');
      toast({ title: data?.message || "Your subscription will not renew." });
    },
    onError: (error: unknown) => {
      toast({ title: apiErrorMessage(error, "Failed to cancel subscription"), variant: "destructive" });
    },
  });

  const resumeSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/subscription/resume', {});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to resume subscription");
      return body;
    },
    onSuccess: (data: any) => {
      refreshBilling();
      toast({ title: data?.message || "Your subscription will renew as normal." });
    },
    onError: (error: unknown) => toast({ title: apiErrorMessage(error, "Failed to resume subscription"), variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (payload: { email: string; name: string }) => {
      const response = await apiRequest('POST', '/api/team/invite', payload);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to send invite");
      return body;
    },
    onSuccess: () => {
      refreshBilling();
      setInviteEmail('');
      setInviteName('');
      toast({ title: "Invite sent" });
    },
    onError: (error: unknown) => {
      toast({ title: apiErrorMessage(error, "Failed to send invite"), variant: "destructive" });
    },
  });

  const memberStatusMutation = useMutation({
    mutationFn: async (payload: { userId: number; status: 'active' | 'disabled' }) => {
      const response = await apiRequest('PUT', `/api/team/${payload.userId}/status`, { status: payload.status });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to update login");
      return body;
    },
    onSuccess: (_data, variables) => {
      refreshBilling();
      toast({ title: variables.status === "active" ? "Login enabled" : "Login disabled" });
    },
    onError: (error: unknown) => toast({ title: apiErrorMessage(error, "Failed to update login"), variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest('DELETE', `/api/team/${userId}`, undefined);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to remove login");
      return body;
    },
    onSuccess: () => {
      refreshBilling();
      toast({ title: "Login removed" });
    },
    onError: (error: unknown) => toast({ title: apiErrorMessage(error, "Failed to remove login"), variant: "destructive" }),
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("POST", `/api/team/${userId}/resend`, {});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to resend invite");
      return body;
    },
    onSuccess: () => {
      refreshBilling();
      toast({ title: "Invite resent" });
    },
    onError: (error: unknown) => toast({ title: apiErrorMessage(error, "Failed to resend invite"), variant: "destructive" }),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("DELETE", `/api/team/${userId}/invite`, undefined);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || "Failed to revoke invite");
      return body;
    },
    onSuccess: () => {
      refreshBilling();
      toast({ title: "Invite revoked" });
    },
    onError: (error: unknown) => toast({ title: apiErrorMessage(error, "Failed to revoke invite"), variant: "destructive" }),
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

  const handleCancelSubscription = () => {
    if (!cancellationReason.trim()) {
      toast({ title: "Please provide a reason for cancellation", variant: "destructive" });
      return;
    }
    cancelSubscriptionMutation.mutate(cancellationReason);
  };

  /**
   * Opens Windcave's hosted card page in this tab. We come back to
   * /settings?section=billing&card=… where the shared return handler confirms
   * the browser-held session, so the PAN is never handled by our JavaScript.
   */
  const handleStartCardSetup = async () => {
    setCardSaving(true);
    try {
      const resp = await apiRequest('POST', '/api/billing/card/session', {});
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body?.redirectUrl) {
        throw new Error(body?.message || 'Could not start card setup');
      }
      sessionStorage.setItem(BILLING_CARD_SESSION_KEY, body.sessionId);
      window.location.href = body.redirectUrl;
    } catch (error: unknown) {
      const msg = apiErrorMessage(error, "Could not start card setup");
      toast({ title: msg, variant: "destructive" });
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
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.message || 'Failed to remove card');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/billing/card'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] }),
      ]);
      toast({ title: "Card removed" });
    } catch (error: unknown) {
      toast({
        title: error instanceof Error ? error.message : "Failed to remove card",
        variant: "destructive",
      });
    } finally {
      setCardRemoving(false);
    }
  };

  const seatLimit = subscription?.seatLimit ?? currentPlan.seats;
  const seatsInUse = teamData?.seatsInUse ?? subscription?.seatsInUse ?? 0;
  const cancellationState = subscriptionCancellationState(subscription);
  const isCancelling = cancellationState === 'scheduled';
  const isCancelled = cancellationState === 'cancelled';
  const hasPaidCurrentPeriod = hasPaidCurrentSubscriptionPeriod(subscription);
  const cardBillingDisclosure = cardSetupBillingDisclosure(
    subscription,
    formatPlanPrice(subscription?.priceCents ?? currentPlan.priceCents),
  );
  const planBillingDisclosure = planChangeBillingDisclosure(subscription);
  const isPastDue = subscription?.status === 'past_due';
  const isSuspended = subscription?.status === 'suspended';

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
        <SettingsSection anchor="set-business" title="Business Details" delay={140} isOpen={openSections.has('business')} onToggle={() => toggle('business')}>
          {!isOwner && (
            <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
              Business details are managed by the account owner.
            </div>
          )}
          <div className="space-y-4 mt-1">
            <div>
              <Label htmlFor="businessName" className="!text-[#040D6D] font-semibold text-base mb-2 block">Company Name</Label>
              <Input
                id="businessName"
                value={businessDetails.businessName}
                onChange={(e) => handleBusinessChange('businessName', e.target.value)}
                disabled={!isOwner}
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
                disabled={!isOwner}
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
                disabled={!isOwner}
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
                disabled={!isOwner}
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
                disabled={!isOwner}
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
                disabled={!isOwner}
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
                disabled={!isOwner}
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
                  disabled={!isOwner}
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
                        disabled={!isOwner}
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

          {isOwner && (
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
          )}
        </SettingsSection>

        {/* Dashboard Preferences Section */}
        <SettingsSection anchor="set-goal" title="Dashboard Preferences" delay={185} isOpen={openSections.has('preferences')} onToggle={() => toggle('preferences')}>
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
                  disabled={!isOwner}
                  className="flex-1"
                  placeholder="500.00"
                  data-testid="input-daily-goal"
                />
                {isOwner && (
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
                )}
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
                  {isOwner
                    ? "To manage your plan or payment method, visit"
                    : "The account owner manages the plan, team logins and payment method."}
                </p>
                {isOwner && <a
                  href="https://taptpay.co.nz/settings"
                  className="font-semibold text-base underline block"
                  style={{ color: '#040D6D' }}
                >
                  taptpay.co.nz
                </a>}
              </div>
            </div>
          </div>
        ) : (
        <div data-settings-section="billing">
        <SettingsSection title="Subscription & Billing" delay={230} isOpen={openSections.has('billing')} onToggle={() => toggle('billing')}>
          <div className="space-y-5 mt-1">
            {/* Current plan */}
            <div className="flex items-start justify-between p-4 bg-gradient-to-r from-[#040D6D]/10 to-[#58ABFF]/12 rounded-xl">
              <div>
                <p className="text-gray-700 font-medium">Current plan</p>
                <p className="text-2xl font-bold text-[#040D6D] mt-1">
                  {currentPlan.name} · {formatPlanPrice(subscription?.priceCents ?? currentPlan.priceCents)}/mo
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {seatsInUse} of {seatLimit} {seatLimit === 1 ? 'login' : 'logins'} in use
                  {subscription?.nextBillingDate && cancellationState === 'active'
                    ? ` · renews ${new Date(subscription.nextBillingDate).toLocaleDateString('en-NZ')}`
                    : ''}
                </p>
              </div>
              {(isCancelling || isCancelled || isPastDue || isSuspended) && (
                <AlertCircle className="text-orange-500 shrink-0" size={24} />
              )}
            </div>

            {isPastDue && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700 font-medium">
                  Your last subscription payment failed. Update your card below — we'll retry automatically.
                </p>
              </div>
            )}
            {isSuspended && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700 font-medium">
                  Your subscription is suspended and payment requests are blocked. Add a working card to reactivate.
                </p>
              </div>
            )}
            {subscription?.pendingPlanName && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  Changing to <strong>{subscription.pendingPlanName}</strong> on{' '}
                  {subscription.pendingPlanEffectiveAt
                    ? new Date(subscription.pendingPlanEffectiveAt).toLocaleDateString('en-NZ')
                    : 'your next billing date'}.
                </p>
              </div>
            )}

            {!isOwner ? (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  The account owner manages plans, team logins, payment methods and billing history.
                </p>
              </div>
            ) : (
            <>
            {/* Change plan */}
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">Change plan</Label>
              <p className="text-xs text-gray-600 mb-3" data-testid="plan-change-billing-disclosure">
                {planBillingDisclosure}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PLAN_LIST.map(plan => {
                  const active = plan.id === currentPlan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      disabled={active || changePlanMutation.isPending}
                      onClick={() => changePlanMutation.mutate(plan.id)}
                      data-testid={`settings-plan-${plan.id}`}
                      className={`text-left p-3 rounded-xl border transition-colors ${
                        active
                          ? 'border-[#040D6D] bg-[#040D6D]/5 cursor-default'
                          : 'border-gray-200 hover:border-[#58ABFF] hover:bg-[#58ABFF]/5'
                      }`}
                    >
                      <span className="block text-sm font-semibold text-[#040D6D]">{plan.name}</span>
                      <span className="block text-lg font-bold text-gray-900">
                        {formatPlanPrice(plan.priceCents)}
                        <span className="text-xs font-normal text-gray-500">/mo</span>
                      </span>
                      <span className="block text-xs text-gray-500 mt-0.5">{plan.blurb}</span>
                      {active && <span className="block text-[10px] font-semibold text-[#040D6D] mt-1">CURRENT</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Need more than 10 logins? <a href="/#tp-contact" className="underline">Talk to us about Enterprise.</a>
              </p>
            </div>

            {/* Team logins are intentionally absent on Solo, which has one owner seat. */}
            {currentPlan.id !== "solo" && (
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">
                Team logins ({seatsInUse} of {seatLimit})
              </Label>
              {teamLoading && (
                <p className="text-xs text-gray-500 mb-2">Loading team logins…</p>
              )}
              {teamError && (
                <p className="text-xs text-red-600 mb-2">
                  {apiErrorMessage(teamError, "Failed to load team logins")}
                </p>
              )}
              <div className="space-y-2">
                {(teamData?.members ?? []).map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{member.name || member.email}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {member.email} · {member.role === 'owner' ? 'Owner' : member.status === 'invited' ? 'Invite sent' : member.status === 'disabled' ? 'Disabled' : 'Member'}
                      </p>
                    </div>
                    {member.role !== 'owner' && member.status === 'invited' && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          disabled={resendInviteMutation.isPending}
                          onClick={() => resendInviteMutation.mutate(member.id)}
                        >
                          Resend
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                          disabled={revokeInviteMutation.isPending}
                          onClick={() => revokeInviteMutation.mutate(member.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
                    {member.role !== 'owner' && member.status !== 'invited' && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          disabled={memberStatusMutation.isPending}
                          onClick={() => memberStatusMutation.mutate({
                            userId: member.id,
                            status: member.status === 'disabled' ? 'active' : 'disabled',
                          })}
                        >
                          {member.status === 'disabled' ? 'Enable' : 'Disable'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                          disabled={removeMemberMutation.isPending}
                          onClick={() => removeMemberMutation.mutate(member.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {seatsInUse < seatLimit ? (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    placeholder="Name (optional)"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="border-gray-200 focus:border-[#040D6D]"
                  />
                  <Input
                    type="email"
                    placeholder="teammate@business.co.nz"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="border-gray-200 focus:border-[#040D6D]"
                    data-testid="input-invite-email"
                  />
                  <Button
                    onClick={() => inviteMutation.mutate({ email: inviteEmail.trim(), name: inviteName.trim() })}
                    disabled={inviteMutation.isPending || !inviteEmail.trim()}
                    className="bg-[#040D6D] hover:bg-[#0a1580] text-[#58ABFF]"
                    data-testid="button-invite-member"
                  >
                    {inviteMutation.isPending ? 'Sending…' : 'Invite'}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mt-3">
                  All of your plan's logins are in use. Upgrade to add more.
                </p>
              )}
            </div>
            )}

            {/* Payment method — Windcave card-on-file */}
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">Payment method</Label>
              <div className="p-3 mb-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-900 font-semibold" data-testid="billing-card-charge-disclosure">
                  {cardBillingDisclosure}
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  Your card is entered on Windcave's secure page. TaptPay only stores the last
                  four digits, and a payment method is required before you can send payment requests.
                </p>
              </div>
              {billingCardStatus?.card && !billingCardStatus.ready && (
                <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700 font-medium">
                    This card can no longer be charged. Please replace it.
                  </p>
                </div>
              )}
              {billingCardStatus?.card ? (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-7 bg-white border border-gray-300 rounded flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-gray-600">
                        {(billingCardStatus.card.brand || 'CARD').toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {billingCardStatus.card.brand || "Card"} ending in {billingCardStatus.card.last4}
                      </p>
                      {billingCardStatus.card.expiry && (
                        <p className="text-xs text-gray-500">Expires {billingCardStatus.card.expiry}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={handleStartCardSetup} disabled={cardSaving || confirmingCard} className="text-xs">
                      {confirmingCard ? "Confirming…" : cardSaving ? "Opening…" : isCancelled ? "Restart" : "Replace"}
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
              ) : (
                <Button
                  onClick={handleStartCardSetup}
                  disabled={cardSaving || confirmingCard}
                  className="w-full bg-[#040D6D] hover:bg-[#0a1580] text-[#58ABFF]"
                  data-testid="button-add-card"
                >
                  {confirmingCard ? "Confirming payment method…" : cardSaving ? "Opening secure page…" : "Add payment method"}
                </Button>
              )}
            </div>

            {/* Billing history */}
            <div>
              <Label className="text-gray-700 text-sm mb-2 block">Billing history</Label>
              {billingHistoryLoading ? (
                <p className="text-xs text-gray-500 p-3 bg-gray-50 rounded-xl">
                  Loading billing history…
                </p>
              ) : billingHistoryError ? (
                <p className="text-xs text-red-600 p-3 bg-red-50 rounded-xl">
                  {apiErrorMessage(billingHistoryError, "Failed to load billing history")}
                </p>
              ) : (billingHistoryData?.history ?? []).length === 0 ? (
                <p className="text-xs text-gray-500 p-3 bg-gray-50 rounded-xl">
                  No subscription invoices yet.
                </p>
              ) : (
                <div className="space-y-2" data-testid="billing-history">
                  {(billingHistoryData?.history ?? []).map((entry) => (
                    <div key={entry.id} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          {entry.description || billingTypeLabel(entry.billingType)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {billingDate(entry.paidAt || entry.createdAt)} · {billingTypeLabel(entry.billingType)}
                        </p>
                        {entry.failureReason && (
                          <p className="text-xs text-red-600 mt-1">{entry.failureReason}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-900">{billingMoney(entry.amount)}</p>
                        <p className={`text-[10px] font-semibold uppercase mt-0.5 ${entry.status === "succeeded" ? "text-green-600" : entry.status === "failed" ? "text-red-600" : "text-gray-500"}`}>
                          {entry.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cancellation */}
            {isCancelled ? (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                <div>
                  <p className="text-sm font-medium text-orange-900 mb-1">Subscription ended</p>
                  <p className="text-xs text-orange-700">
                    This subscription is no longer active. Restart securely with your payment method
                    to restore access.
                  </p>
                </div>
                <p className="text-xs font-semibold text-orange-900" data-testid="restart-billing-disclosure">
                  {cardBillingDisclosure}
                </p>
                <Button
                  className="w-full bg-[#040D6D] hover:bg-[#0a1580] text-[#58ABFF]"
                  disabled={cardSaving || confirmingCard}
                  onClick={handleStartCardSetup}
                  data-testid="button-restart-subscription"
                >
                  {confirmingCard ? "Confirming payment method…" : cardSaving ? "Opening secure page…" : "Restart subscription"}
                </Button>
              </div>
            ) : isCancelling ? (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                <div>
                  <p className="text-sm font-medium text-orange-900 mb-1">Subscription ending</p>
                  <p className="text-xs text-orange-700">
                    Your access continues until{' '}
                    {subscription?.cancellationEffectiveDate
                      ? new Date(subscription.cancellationEffectiveDate).toLocaleDateString('en-NZ')
                      : 'the end of your current period'}
                    . You won't be charged again.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={resumeSubscriptionMutation.isPending}
                  onClick={() => resumeSubscriptionMutation.mutate()}
                  data-testid="button-resume-subscription"
                >
                  {resumeSubscriptionMutation.isPending ? "Resuming…" : "Keep my subscription"}
                </Button>
              </div>
            ) : !showCancelDialog ? (
              <Button
                variant="outline"
                className="w-full border-red-500 text-red-500 hover:bg-red-50"
                onClick={() => setShowCancelDialog(true)}
                data-testid="button-cancel-subscription"
              >
                Cancel subscription
              </Button>
            ) : (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                <p className="text-sm font-medium text-red-900">Cancel subscription</p>
                <p className="text-xs text-red-700">
                  {hasPaidCurrentPeriod ? (
                    <>
                      You'll keep full access until{' '}
                      {subscription?.currentPeriodEnd
                        ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-NZ')
                        : 'the end of your current period'}
                      , and you won't be charged again. You can undo this any time before then.
                    </>
                  ) : (
                    <>Your subscription will end immediately, and you won't be charged again.</>
                  )}{' '}
                  Please tell us why you're leaving:
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
                    Keep subscription
                  </Button>
                  <Button
                    onClick={handleCancelSubscription}
                    disabled={cancelSubscriptionMutation.isPending || !cancellationReason.trim()}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                    data-testid="button-confirm-cancel"
                  >
                    {cancelSubscriptionMutation.isPending ? "Processing..." : "Confirm cancellation"}
                  </Button>
                </div>
              </div>
            )}
            </>
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

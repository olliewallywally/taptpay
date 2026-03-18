import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getCurrentMerchantId } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Upload, Palette, Type, QrCode, Image as ImageIcon,
  Layout, CheckCircle, Loader2, ChevronDown
} from "lucide-react";
import jsPDF from "jspdf";

type LayoutKey = "a4-portrait" | "a4-landscape" | "a6-portrait" | "a6-landscape";

const LAYOUTS: Record<LayoutKey, { label: string; mmW: number; mmH: number; pxW: number; pxH: number }> = {
  "a4-portrait":  { label: "A4 Portrait",  mmW: 210, mmH: 297, pxW: 794,  pxH: 1123 },
  "a4-landscape": { label: "A4 Landscape", mmW: 297, mmH: 210, pxW: 1123, pxH: 794  },
  "a6-portrait":  { label: "A6 Portrait",  mmW: 105, mmH: 148, pxW: 397,  pxH: 559  },
  "a6-landscape": { label: "A6 Landscape", mmW: 148, mmH: 105, pxW: 559,  pxH: 397  },
};

const PRESET_COLORS = [
  { label: "TaptPay Blue",  value: "#0055FF" },
  { label: "Teal",          value: "#00E5CC" },
  { label: "Dark Navy",     value: "#1a1a2e" },
  { label: "Forest Green",  value: "#2d6a4f" },
  { label: "Crimson",       value: "#e63946" },
  { label: "Slate",         value: "#334155" },
  { label: "Purple",        value: "#7c3aed" },
  { label: "Black",         value: "#111827" },
];

const GOOGLE_FONTS = [
  "Outfit", "Inter", "Poppins", "Montserrat", "Raleway",
  "Playfair Display", "Oswald", "Lato", "Nunito", "Roboto",
];

function loadGoogleFont(fontName: string) {
  const id = `gfont-${fontName.replace(/\s+/g, "-")}`;
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }
}

async function fetchAsDataUrl(url: string, authToken?: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface BoardDesignProps {
  layout: LayoutKey;
  primaryColor: string;
  businessName: string;
  tagline: string;
  instructions: string;
  footer: string;
  logoDataUrl: string;
  fontFamily: string;
  qrDataUrl: string;
  scale?: number;
}

function BoardDesign({
  layout, primaryColor, businessName, tagline, instructions, footer,
  logoDataUrl, fontFamily, qrDataUrl, scale = 1,
}: BoardDesignProps) {
  const dim = LAYOUTS[layout];
  const isLandscape = dim.pxW > dim.pxH;
  const isA6 = dim.pxW <= 600;
  const fs = isA6 ? 0.5 : 1;
  const margin = Math.round(dim.pxW * 0.048);
  const qrSize = isLandscape
    ? Math.min(dim.pxH * 0.55, dim.pxW * 0.28)
    : Math.min(dim.pxW * 0.57, dim.pxH * 0.35);
  const qrPad = Math.round(20 * fs);
  const panelRadius = Math.round(20 * fs);

  const containerStyle: React.CSSProperties = {
    width: dim.pxW,
    height: dim.pxH,
    backgroundColor: primaryColor,
    fontFamily: `'${fontFamily}', sans-serif`,
    position: "relative",
    flexShrink: 0,
    overflow: "hidden",
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: "top left",
  };

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    top: margin,
    left: margin,
    right: margin,
    bottom: margin,
    backgroundColor: "white",
    borderRadius: panelRadius,
    overflow: "hidden",
    display: "flex",
    flexDirection: isLandscape ? "row" : "column",
  };

  const qrBox = (
    <div style={{
      background: "#f9fafb",
      borderRadius: Math.round(14 * fs),
      padding: qrPad,
      border: "1px solid #e5e7eb",
      display: "inline-flex",
    }}>
      {qrDataUrl ? (
        <img src={qrDataUrl} style={{ width: qrSize, height: qrSize, display: "block" }} alt="QR" />
      ) : (
        <div style={{
          width: qrSize, height: qrSize, background: "#f3f4f6",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 8, flexDirection: "column", gap: 8,
        }}>
          <QrCode size={Math.round(40 * fs)} color="#d1d5db" />
          <span style={{ color: "#9ca3af", fontSize: Math.round(13 * fs), textAlign: "center", maxWidth: qrSize * 0.8 }}>
            Select a stone above to preview your QR code
          </span>
        </div>
      )}
    </div>
  );

  if (isLandscape) {
    const rightW = Math.round(dim.pxW * 0.42);
    const leftPad = Math.round(40 * fs);
    return (
      <div style={containerStyle}>
        <div style={panelStyle}>
          {/* Left: content */}
          <div style={{
            flex: 1, padding: leftPad,
            display: "flex", flexDirection: "column",
            borderRight: "1px solid #e5e7eb",
          }}>
            {logoDataUrl ? (
              <img src={logoDataUrl} style={{ height: Math.round(52 * fs), objectFit: "contain", alignSelf: "flex-start", marginBottom: Math.round(20 * fs) }} alt="Logo" />
            ) : (
              <div style={{ height: Math.round(20 * fs) }} />
            )}
            <div style={{ width: Math.round(48 * fs), height: 3, backgroundColor: primaryColor, borderRadius: 2, marginBottom: Math.round(18 * fs) }} />
            <h1 style={{ fontSize: Math.round(46 * fs), fontWeight: 700, color: primaryColor, margin: 0, lineHeight: 1.15, wordBreak: "break-word" }}>
              {businessName || "Your Business Name"}
            </h1>
            {tagline && (
              <p style={{ fontSize: Math.round(21 * fs), color: "#6b7280", margin: `${Math.round(8 * fs)}px 0 0 0` }}>{tagline}</p>
            )}
            <div style={{ flex: 1 }} />
            <h2 style={{ fontSize: Math.round(30 * fs), fontWeight: 600, color: "#111827", margin: `0 0 ${Math.round(6 * fs)}px 0` }}>
              {instructions || "Scan to Pay"}
            </h2>
            <p style={{ fontSize: Math.round(14 * fs), color: "#9ca3af", margin: `0 0 ${Math.round(24 * fs)}px 0` }}>
              Apple Pay · Google Pay · Visa payWave · Mastercard
            </p>
            <p style={{ fontSize: Math.round(12 * fs), color: "#9ca3af", margin: 0 }}>
              {footer || "Powered by TaptPay"}
            </p>
          </div>
          {/* Right: QR */}
          <div style={{
            width: rightW,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: Math.round(30 * fs),
            gap: Math.round(12 * fs),
          }}>
            <p style={{ fontSize: Math.round(14 * fs), color: "#9ca3af", margin: 0 }}>scan to pay</p>
            {qrBox}
            <p style={{ fontSize: Math.round(12 * fs), color: "#9ca3af", margin: 0 }}>scan with your phone camera</p>
          </div>
        </div>
      </div>
    );
  }

  // Portrait
  const pad = Math.round(44 * fs);
  return (
    <div style={containerStyle}>
      {/* Accent bar */}
      <div style={{
        position: "absolute", top: margin, left: margin,
        right: margin, height: Math.round(8 * fs),
        backgroundColor: "#00E5CC",
        borderRadius: `${panelRadius}px ${panelRadius}px 0 0`,
        zIndex: 1,
      }} />
      <div style={{ ...panelStyle, flexDirection: "column", alignItems: "center", padding: `${Math.round(12 * fs + 8 * fs)}px ${pad}px ${pad}px`, boxSizing: "border-box" }}>
        {logoDataUrl ? (
          <img src={logoDataUrl} style={{ height: Math.round(56 * fs), objectFit: "contain", marginBottom: Math.round(16 * fs), marginTop: Math.round(8 * fs) }} alt="Logo" />
        ) : (
          <div style={{ height: Math.round(24 * fs) }} />
        )}
        <div style={{ width: "80%", height: 1, backgroundColor: "#e5e7eb", marginBottom: Math.round(18 * fs) }} />
        <h1 style={{ fontSize: Math.round(48 * fs), fontWeight: 700, color: primaryColor, margin: 0, textAlign: "center", lineHeight: 1.15, wordBreak: "break-word" }}>
          {businessName || "Your Business Name"}
        </h1>
        {tagline && (
          <p style={{ fontSize: Math.round(20 * fs), color: "#6b7280", margin: `${Math.round(8 * fs)}px 0 0 0`, textAlign: "center" }}>{tagline}</p>
        )}
        <div style={{ marginTop: Math.round(24 * fs) }}>
          {qrBox}
        </div>
        <p style={{ fontSize: Math.round(13 * fs), color: "#9ca3af", margin: `${Math.round(10 * fs)}px 0 0 0` }}>scan with your phone camera</p>
        <div style={{ width: "80%", height: 1, backgroundColor: "#e5e7eb", margin: `${Math.round(20 * fs)}px 0` }} />
        <h2 style={{ fontSize: Math.round(32 * fs), fontWeight: 600, color: "#111827", margin: 0 }}>
          {instructions || "Scan to Pay"}
        </h2>
        <p style={{ fontSize: Math.round(13 * fs), color: "#9ca3af", marginTop: Math.round(6 * fs), textAlign: "center" }}>
          Apple Pay · Google Pay · Visa payWave · Mastercard
        </p>
        <div style={{ flex: 1 }} />
        <p style={{ fontSize: Math.round(12 * fs), color: "#9ca3af", margin: 0 }}>
          {footer || "Powered by TaptPay"}
        </p>
      </div>
    </div>
  );
}

export default function BoardBuilder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const captureRef = useRef<HTMLDivElement>(null);

  const merchantId = getCurrentMerchantId();

  useEffect(() => {
    if (!merchantId) setLocation("/login");
  }, [merchantId, setLocation]);

  const token = localStorage.getItem("authToken") || "";

  const merchantQuery = useQuery<any>({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!merchantId,
  });

  const stonesQuery = useQuery<any[]>({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}/tapt-stones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!merchantId,
  });

  const [layout, setLayout] = useState<LayoutKey>("a4-portrait");
  const [primaryColor, setPrimaryColor] = useState("#0055FF");
  const [hexInput, setHexInput] = useState("#0055FF");
  const [businessName, setBusinessName] = useState("");
  const [tagline, setTagline] = useState("");
  const [instructions, setInstructions] = useState("Scan to Pay");
  const [footer, setFooter] = useState("Powered by TaptPay");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [selectedFont, setSelectedFont] = useState("Outfit");
  const [customFontFamily, setCustomFontFamily] = useState("");
  const [selectedStoneId, setSelectedStoneId] = useState<string>("main");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fetchingQr, setFetchingQr] = useState(false);
  const [openSection, setOpenSection] = useState<string>("stone");

  const activeFontFamily = customFontFamily || selectedFont;

  useEffect(() => {
    loadGoogleFont(selectedFont);
  }, [selectedFont]);

  useEffect(() => {
    if (merchantQuery.data) {
      setBusinessName(merchantQuery.data.businessName || merchantQuery.data.name || "");
    }
  }, [merchantQuery.data]);

  useEffect(() => {
    if (!merchantId) return;
    setFetchingQr(true);
    const url = selectedStoneId === "main"
      ? `/api/merchants/${merchantId}/qr?size=600`
      : `/api/merchants/${merchantId}/stone/${selectedStoneId}/qr?size=600`;
    fetchAsDataUrl(url, token)
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""))
      .finally(() => setFetchingQr(false));
  }, [merchantId, selectedStoneId, token]);

  const handleColorChange = (value: string) => {
    setPrimaryColor(value);
    setHexInput(value);
  };

  const handleHexInput = (value: string) => {
    setHexInput(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setPrimaryColor(value);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setLogoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const name = "CustomFont_" + Date.now();
      const ff = new FontFace(name, `url(${dataUrl})`);
      ff.load().then((loaded) => {
        document.fonts.add(loaded);
        setCustomFontFamily(name);
        toast({ title: "Custom font loaded", description: file.name });
      });
    };
    reader.readAsDataURL(file);
  };

  const dim = LAYOUTS[layout];

  const PREVIEW_MAX_W = 380;
  const PREVIEW_MAX_H = 520;
  const previewScale = Math.min(PREVIEW_MAX_W / dim.pxW, PREVIEW_MAX_H / dim.pxH);

  const handleGeneratePdf = async () => {
    if (!submitterName.trim() || !submitterEmail.trim()) {
      toast({ title: "Please enter your name and email before submitting.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const captureEl = captureRef.current;
      if (!captureEl) throw new Error("Capture element not found");

      await document.fonts.ready;

      const { default: html2canvas } = await import("html2canvas");

      const canvas = await html2canvas(captureEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
        width: dim.pxW,
        height: dim.pxH,
      });

      const imgData = canvas.toDataURL("image/png");
      const orientation = dim.mmW > dim.mmH ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: [dim.mmW, dim.mmH],
      });

      pdf.addImage(imgData, "PNG", 0, 0, dim.mmW, dim.mmH);
      const pdfBase64 = pdf.output("datauristring").split(",")[1];

      const response = await apiRequest("POST", "/api/board-builder/submit", {
        pdf: pdfBase64,
        businessName: businessName || "Business",
        submitterName,
        submitterEmail,
        stoneId: selectedStoneId,
        layout: LAYOUTS[layout].label,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Submission failed");
      }

      setSubmitted(true);
      toast({ title: "Sent! We'll get your board printed and in touch soon." });
    } catch (error: any) {
      console.error("PDF generation error:", error);
      toast({ title: "Failed to generate PDF", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggle = (section: string) => setOpenSection(s => s === section ? "" : section);

  const stones: any[] = stonesQuery.data || [];

  if (!merchantId) return null;

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-[#00E5CC] mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Board Submitted!</h1>
          <p className="text-gray-600 mb-8">
            Your payment board design has been sent for printing. We'll be in touch shortly.
          </p>
          <div className="space-y-3">
            <Button onClick={() => setSubmitted(false)} className="w-full bg-[#0055FF] hover:bg-[#0044DD] text-white">
              Design Another Board
            </Button>
            <Button variant="outline" onClick={() => setLocation("/dashboard")} className="w-full">
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")} className="gap-2 text-gray-600">
          <ArrowLeft size={16} /> Dashboard
        </Button>
        <div className="h-5 w-px bg-gray-200" />
        <h1 className="font-semibold text-gray-900">Payment Board Builder</h1>
        <span className="text-xs bg-[#0055FF]/10 text-[#0055FF] px-2 py-0.5 rounded-full font-medium ml-1">Beta</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-0 min-h-[calc(100vh-57px)]">
        {/* LEFT PANEL: Controls */}
        <div className="w-full lg:w-[340px] xl:w-[380px] bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="p-4 space-y-1">

            {/* Stone selector */}
            <ControlSection
              icon={<QrCode size={16} />}
              title="Payment QR Code"
              isOpen={openSection === "stone"}
              onToggle={() => toggle("stone")}
            >
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Select which Tapt Stone or payment link to show</Label>
                <Select value={selectedStoneId} onValueChange={setSelectedStoneId}>
                  <SelectTrigger className="border-gray-200 focus:border-[#0055FF]">
                    <SelectValue placeholder="Select stone…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Main Payment Link</SelectItem>
                    {stones.filter(s => s.isActive).map((stone) => (
                      <SelectItem key={stone.id} value={String(stone.id)}>
                        {stone.name} (Stone {stone.stoneNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fetchingQr && <p className="text-xs text-[#0055FF] flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading QR code…</p>}
                {!fetchingQr && qrDataUrl && <p className="text-xs text-green-600">✓ QR code loaded</p>}
              </div>
            </ControlSection>

            {/* Layout */}
            <ControlSection
              icon={<Layout size={16} />}
              title="Layout"
              isOpen={openSection === "layout"}
              onToggle={() => toggle("layout")}
            >
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(LAYOUTS) as LayoutKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setLayout(key)}
                    className={`relative border-2 rounded-xl p-3 text-xs font-medium transition-all ${layout === key ? "border-[#0055FF] bg-[#0055FF]/5 text-[#0055FF]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                  >
                    <div className={`mx-auto mb-2 border-2 rounded ${layout === key ? "border-[#0055FF]" : "border-gray-300"} ${key.includes("portrait") ? "w-7 h-9" : "w-9 h-7"}`} />
                    {LAYOUTS[key].label}
                  </button>
                ))}
              </div>
            </ControlSection>

            {/* Colour */}
            <ControlSection
              icon={<Palette size={16} />}
              title="Colour"
              isOpen={openSection === "colour"}
              onToggle={() => toggle("colour")}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      title={c.label}
                      onClick={() => handleColorChange(c.value)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${primaryColor === c.value ? "border-gray-900 scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: primaryColor }} />
                  <Input
                    value={hexInput}
                    onChange={(e) => handleHexInput(e.target.value)}
                    placeholder="#0055FF"
                    className="font-mono text-sm border-gray-200 focus:border-[#0055FF]"
                    maxLength={7}
                  />
                </div>
              </div>
            </ControlSection>

            {/* Logo */}
            <ControlSection
              icon={<ImageIcon size={16} />}
              title="Logo"
              isOpen={openSection === "logo"}
              onToggle={() => toggle("logo")}
            >
              <div className="space-y-3">
                {logoDataUrl && (
                  <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    <img src={logoDataUrl} className="h-10 object-contain max-w-[120px]" alt="Logo preview" />
                    <Button variant="ghost" size="sm" className="text-gray-500 text-xs" onClick={() => setLogoDataUrl("")}>Remove</Button>
                  </div>
                )}
                <label className="block border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-[#0055FF] hover:bg-[#0055FF]/5 transition-all">
                  <Upload size={20} className="mx-auto text-gray-400 mb-1" />
                  <p className="text-xs text-gray-500">{logoDataUrl ? "Replace logo" : "Upload logo"}</p>
                  <p className="text-xs text-gray-400">PNG, JPG, SVG · max 5MB</p>
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
              </div>
            </ControlSection>

            {/* Text */}
            <ControlSection
              icon={<Type size={16} />}
              title="Text"
              isOpen={openSection === "text"}
              onToggle={() => toggle("text")}
            >
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Business Name</Label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your Business Name" className="border-gray-200 focus:border-[#0055FF]" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Tagline (optional)</Label>
                  <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. Fresh coffee · Thorndon" className="border-gray-200 focus:border-[#0055FF]" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Payment Instruction</Label>
                  <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Scan to Pay" className="border-gray-200 focus:border-[#0055FF]" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Footer Note</Label>
                  <Input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Powered by TaptPay" className="border-gray-200 focus:border-[#0055FF]" />
                </div>
              </div>
            </ControlSection>

            {/* Font */}
            <ControlSection
              icon={<Type size={16} />}
              title="Font"
              isOpen={openSection === "font"}
              onToggle={() => toggle("font")}
            >
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Google Fonts</Label>
                  <Select
                    value={selectedFont}
                    onValueChange={(v) => { setSelectedFont(v); setCustomFontFamily(""); }}
                  >
                    <SelectTrigger className="border-gray-200 focus:border-[#0055FF]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOOGLE_FONTS.map((f) => (
                        <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Or upload a custom font</Label>
                  <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:border-[#0055FF] transition-all">
                    <Upload size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {customFontFamily ? "Custom font loaded ✓" : "Upload .ttf / .otf / .woff"}
                    </span>
                    <input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={handleFontUpload} />
                  </label>
                  {customFontFamily && (
                    <Button variant="ghost" size="sm" className="text-xs text-gray-500 mt-1" onClick={() => setCustomFontFamily("")}>
                      Remove custom font
                    </Button>
                  )}
                </div>
              </div>
            </ControlSection>
          </div>
        </div>

        {/* RIGHT PANEL: Live Preview */}
        <div className="flex-1 flex flex-col items-center bg-gray-100 p-6 gap-8">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4 font-medium">Live Preview — {LAYOUTS[layout].label} ({LAYOUTS[layout].mmW}×{LAYOUTS[layout].mmH}mm)</p>
            <div
              style={{
                width: Math.round(dim.pxW * previewScale),
                height: Math.round(dim.pxH * previewScale),
                overflow: "hidden",
                flexShrink: 0,
                boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                borderRadius: 8,
              }}
            >
              <BoardDesign
                layout={layout}
                primaryColor={primaryColor}
                businessName={businessName}
                tagline={tagline}
                instructions={instructions}
                footer={footer}
                logoDataUrl={logoDataUrl}
                fontFamily={activeFontFamily}
                qrDataUrl={qrDataUrl}
                scale={previewScale}
              />
            </div>
          </div>

          {/* Submit section */}
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-1">Ready to print?</h3>
            <p className="text-sm text-gray-500 mb-4">We'll email your board design as a PDF ready for printing.</p>
            <div className="space-y-3">
              <Input
                placeholder="Your name"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                className="border-gray-200 focus:border-[#0055FF]"
              />
              <Input
                placeholder="Your email"
                type="email"
                value={submitterEmail}
                onChange={(e) => setSubmitterEmail(e.target.value)}
                className="border-gray-200 focus:border-[#0055FF]"
              />
              <Button
                onClick={handleGeneratePdf}
                disabled={isSubmitting}
                className="w-full bg-[#0055FF] hover:bg-[#0044DD] text-white font-medium py-3 rounded-xl"
              >
                {isSubmitting ? (
                  <><Loader2 size={16} className="animate-spin mr-2" /> Generating PDF…</>
                ) : (
                  "Send to Print"
                )}
              </Button>
              <p className="text-xs text-gray-400 text-center">Your design will be emailed to our print team. We'll be in touch.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden full-size capture div */}
      <div style={{ position: "fixed", left: "-9999px", top: 0, pointerEvents: "none", opacity: 1 }}>
        <div ref={captureRef}>
          <BoardDesign
            layout={layout}
            primaryColor={primaryColor}
            businessName={businessName}
            tagline={tagline}
            instructions={instructions}
            footer={footer}
            logoDataUrl={logoDataUrl}
            fontFamily={activeFontFamily}
            qrDataUrl={qrDataUrl}
            scale={1}
          />
        </div>
      </div>
    </div>
  );
}

function ControlSection({
  icon, title, isOpen, onToggle, children,
}: {
  icon: React.ReactNode;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 font-medium text-sm text-gray-800">
          <span className="text-[#0055FF]">{icon}</span>
          {title}
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      <div
        style={{
          display: "grid",
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          transition: "grid-template-rows 0.22s ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-50">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

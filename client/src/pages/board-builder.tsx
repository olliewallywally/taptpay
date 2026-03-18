import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

const LAYOUTS: Record<LayoutKey, { label: string; mmW: number; mmH: number; pxW: number; pxH: number; aspect: number }> = {
  "a4-portrait":  { label: "A4 Portrait",  mmW: 210, mmH: 297, pxW: 794,  pxH: 1123, aspect: 297/210 },
  "a4-landscape": { label: "A4 Landscape", mmW: 297, mmH: 210, pxW: 1123, pxH: 794,  aspect: 210/297 },
  "a6-portrait":  { label: "A6 Portrait",  mmW: 105, mmH: 148, pxW: 397,  pxH: 559,  aspect: 148/105 },
  "a6-landscape": { label: "A6 Landscape", mmW: 148, mmH: 105, pxW: 559,  pxH: 397,  aspect: 105/148 },
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

function buildModifiedSvg(opts: {
  svgTemplate: string;
  layout: LayoutKey;
  primaryColor: string;
  businessName: string;
  tagline: string;
  instructions: string;
  footer: string;
  qrDataUrl: string;
  logoDataUrl: string;
  selectedFont: string;
  customFontDataUrl: string;
  forCapture?: boolean;
}): string {
  const {
    svgTemplate, layout, primaryColor, businessName, tagline, instructions,
    footer, qrDataUrl, logoDataUrl, selectedFont, customFontDataUrl, forCapture = false,
  } = opts;

  if (!svgTemplate) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgTemplate, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;

  const dim = LAYOUTS[layout];

  if (forCapture) {
    svg.setAttribute("width", String(dim.pxW));
    svg.setAttribute("height", String(dim.pxH));
  } else {
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  // Inject font via Google Fonts API (dynamic loading)
  let defsEl = svg.querySelector("defs");
  if (!defsEl) {
    defsEl = doc.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.insertBefore(defsEl, svg.firstChild);
  }

  let styleEl = doc.getElementById("font-style") as SVGStyleElement | null;
  if (!styleEl) {
    styleEl = doc.createElementNS("http://www.w3.org/2000/svg", "style") as unknown as SVGStyleElement;
    (styleEl as any).id = "font-style";
    defsEl.appendChild(styleEl);
  }

  if (customFontDataUrl) {
    styleEl.textContent = `
      @font-face { font-family: '__CustomFont__'; src: url('${customFontDataUrl}'); }
      text, tspan { font-family: '__CustomFont__', sans-serif !important; }
    `;
  } else {
    const gfUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(selectedFont)}:wght@400;600;700&display=swap`;
    styleEl.textContent = `
      @import url('${gfUrl}');
      text, tspan { font-family: '${selectedFont}', sans-serif; }
    `;
  }

  // Primary colour background
  const colorEl = doc.getElementById("color-primary");
  if (colorEl) colorEl.setAttribute("fill", primaryColor);

  // Accent colour (match primary)
  const accentEl = doc.getElementById("color-accent");
  if (accentEl) accentEl.setAttribute("fill", primaryColor);

  // Helper to set text + optional fill
  const setText = (id: string, text: string, fill?: string) => {
    const el = doc.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (fill) el.setAttribute("fill", fill);
  };

  setText("text-business-name", businessName || "Your Business Name", primaryColor);
  setText("text-tagline", tagline || "Your tagline or location here");
  setText("text-instructions", instructions || "Scan to Pay");
  setText("text-footer", footer || "Powered by TaptPay");

  // QR code image
  const qrEl = doc.getElementById("qr-placeholder");
  if (qrEl) {
    qrEl.setAttribute("href", qrDataUrl);
    qrEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", qrDataUrl);
  }

  // Logo image
  const logoEl = doc.getElementById("logo-placeholder");
  if (logoEl) {
    logoEl.setAttribute("href", logoDataUrl);
    logoEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", logoDataUrl);
  }

  return new XMLSerializer().serializeToString(svg as unknown as Node);
}

export default function BoardBuilder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const merchantId = getCurrentMerchantId();
  const token = localStorage.getItem("authToken") || "";

  useEffect(() => {
    if (!merchantId) setLocation("/login?returnTo=/board-builder");
  }, [merchantId, setLocation]);

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

  // Board state
  const [layout, setLayout] = useState<LayoutKey>("a4-portrait");
  const [primaryColor, setPrimaryColor] = useState("#0055FF");
  const [hexInput, setHexInput] = useState("#0055FF");
  const [businessName, setBusinessName] = useState("");
  const [tagline, setTagline] = useState("");
  const [instructions, setInstructions] = useState("Scan to Pay");
  const [footer, setFooter] = useState("Powered by TaptPay");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [selectedFont, setSelectedFont] = useState("Outfit");
  const [customFontDataUrl, setCustomFontDataUrl] = useState("");
  const [selectedStoneId, setSelectedStoneId] = useState<string>("main");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [fetchingQr, setFetchingQr] = useState(false);

  // Template loading
  const [svgTemplate, setSvgTemplate] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);

  // Submission
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // UI state
  const [openSection, setOpenSection] = useState<string>("stone");

  // Load SVG template when layout changes
  useEffect(() => {
    setTemplateLoading(true);
    fetch(`/templates/${layout}.svg`)
      .then((r) => r.text())
      .then((text) => {
        setSvgTemplate(text);
        setTemplateLoading(false);
      })
      .catch(() => {
        setTemplateLoading(false);
        toast({ title: "Failed to load template", variant: "destructive" });
      });
  }, [layout]);

  // Load Google Font into document (for live preview)
  useEffect(() => {
    if (!selectedFont || customFontDataUrl) return;
    const id = `gfont-${selectedFont.replace(/\s+/g, "-")}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(selectedFont)}:wght@400;600;700&display=swap`;
      document.head.appendChild(link);
    }
  }, [selectedFont, customFontDataUrl]);

  // Pre-populate business name from merchant data
  useEffect(() => {
    if (merchantQuery.data?.businessName) {
      setBusinessName(merchantQuery.data.businessName);
    }
  }, [merchantQuery.data]);

  // Fetch QR code as data URL when stone selection changes
  useEffect(() => {
    if (!merchantId) return;
    setFetchingQr(true);
    const url =
      selectedStoneId === "main"
        ? `/api/merchants/${merchantId}/qr?size=600`
        : `/api/merchants/${merchantId}/stone/${selectedStoneId}/qr?size=600`;
    fetchAsDataUrl(url, token)
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""))
      .finally(() => setFetchingQr(false));
  }, [merchantId, selectedStoneId, token]);

  // Compute modified SVG (memoized)
  const svgOpts = {
    svgTemplate,
    layout,
    primaryColor,
    businessName,
    tagline,
    instructions,
    footer,
    qrDataUrl,
    logoDataUrl,
    selectedFont,
    customFontDataUrl,
  };

  const previewSvg = useMemo(
    () => buildModifiedSvg({ ...svgOpts, forCapture: false }),
    [svgTemplate, layout, primaryColor, businessName, tagline, instructions, footer, qrDataUrl, logoDataUrl, selectedFont, customFontDataUrl]
  );

  const dim = LAYOUTS[layout];
  const PREVIEW_MAX_W = 380;
  const PREVIEW_MAX_H = 540;
  const previewW = Math.min(PREVIEW_MAX_W, PREVIEW_MAX_H / dim.aspect);
  const previewH = previewW * dim.aspect;

  const handleColorChange = (value: string) => {
    setPrimaryColor(value);
    setHexInput(value);
  };

  const handleHexInput = (value: string) => {
    setHexInput(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) setPrimaryColor(value);
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
      const name = "__CustomFont__";
      const ff = new FontFace(name, `url(${dataUrl})`);
      ff.load().then((loaded) => {
        document.fonts.add(loaded);
        setCustomFontDataUrl(dataUrl);
        toast({ title: "Custom font loaded", description: file.name });
      });
    };
    reader.readAsDataURL(file);
  };

  const handleGeneratePdf = async () => {
    if (!submitterName.trim() || !submitterEmail.trim()) {
      toast({ title: "Please enter your name and email before submitting.", variant: "destructive" });
      return;
    }
    if (!svgTemplate) {
      toast({ title: "Template not loaded yet, please wait.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      // Build capture SVG at 2× print dimensions
      const captureSvg = buildModifiedSvg({ ...svgOpts, forCapture: true });
      const capturePxW = dim.pxW * 2;
      const capturePxH = dim.pxH * 2;

      // Convert SVG to canvas via blob image
      const svgBlob = new Blob([captureSvg], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.width = capturePxW;
      img.height = capturePxH;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to render SVG as image"));
        img.src = svgUrl;
      });
      URL.revokeObjectURL(svgUrl);

      const canvas = document.createElement("canvas");
      canvas.width = capturePxW;
      canvas.height = capturePxH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, capturePxW, capturePxH);
      ctx.drawImage(img, 0, 0, capturePxW, capturePxH);

      const imgData = canvas.toDataURL("image/png");
      const orientation = dim.mmW > dim.mmH ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "mm", format: [dim.mmW, dim.mmH] });
      pdf.addImage(imgData, "PNG", 0, 0, dim.mmW, dim.mmH);
      const pdfBase64 = pdf.output("datauristring").split(",")[1];

      const response = await apiRequest("POST", "/api/board-builder/submit", {
        pdf: pdfBase64,
        businessName: businessName || "Business",
        submitterName,
        submitterEmail,
        stoneId: selectedStoneId,
        layout: dim.label,
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

  const toggle = (section: string) => setOpenSection((s) => (s === section ? "" : section));
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

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-57px)]">
        {/* LEFT PANEL: Controls */}
        <div className="w-full lg:w-[340px] xl:w-[380px] bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="p-4 space-y-1">

            {/* Stone selector */}
            <ControlSection icon={<QrCode size={16} />} title="Payment QR Code" isOpen={openSection === "stone"} onToggle={() => toggle("stone")}>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Select which Tapt Stone or payment link to show</Label>
                <Select value={selectedStoneId} onValueChange={setSelectedStoneId}>
                  <SelectTrigger className="border-gray-200 focus:border-[#0055FF]">
                    <SelectValue placeholder="Select stone…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Main Payment Link</SelectItem>
                    {stones.filter((s) => s.isActive).map((stone) => (
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
            <ControlSection icon={<Layout size={16} />} title="Layout" isOpen={openSection === "layout"} onToggle={() => toggle("layout")}>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(LAYOUTS) as LayoutKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setLayout(key)}
                    className={`border-2 rounded-xl p-3 text-xs font-medium transition-all ${layout === key ? "border-[#0055FF] bg-[#0055FF]/5 text-[#0055FF]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                  >
                    <div className={`mx-auto mb-2 border-2 rounded ${layout === key ? "border-[#0055FF]" : "border-gray-300"} ${key.includes("portrait") ? "w-7 h-9" : "w-9 h-7"}`} />
                    {LAYOUTS[key].label}
                  </button>
                ))}
              </div>
            </ControlSection>

            {/* Colour */}
            <ControlSection icon={<Palette size={16} />} title="Colour" isOpen={openSection === "colour"} onToggle={() => toggle("colour")}>
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
            <ControlSection icon={<ImageIcon size={16} />} title="Logo" isOpen={openSection === "logo"} onToggle={() => toggle("logo")}>
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
            <ControlSection icon={<Type size={16} />} title="Text" isOpen={openSection === "text"} onToggle={() => toggle("text")}>
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
            <ControlSection icon={<Type size={16} />} title="Font" isOpen={openSection === "font"} onToggle={() => toggle("font")}>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Google Fonts</Label>
                  <Select value={selectedFont} onValueChange={(v) => { setSelectedFont(v); setCustomFontDataUrl(""); }}>
                    <SelectTrigger className="border-gray-200 focus:border-[#0055FF]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOOGLE_FONTS.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Or upload a custom font</Label>
                  <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:border-[#0055FF] transition-all">
                    <Upload size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {customFontDataUrl ? "Custom font loaded ✓" : "Upload .ttf / .otf / .woff"}
                    </span>
                    <input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={handleFontUpload} />
                  </label>
                  {customFontDataUrl && (
                    <Button variant="ghost" size="sm" className="text-xs text-gray-500 mt-1" onClick={() => setCustomFontDataUrl("")}>
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
            <p className="text-sm text-gray-500 mb-4 font-medium">
              Live Preview — {dim.label} ({dim.mmW}×{dim.mmH}mm)
            </p>
            <div
              style={{
                width: Math.round(previewW),
                height: Math.round(previewH),
                overflow: "hidden",
                boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                borderRadius: 8,
                flexShrink: 0,
                background: "#f9fafb",
              }}
            >
              {templateLoading ? (
                <div className="w-full h-full flex items-center justify-center bg-white">
                  <Loader2 className="animate-spin text-[#0055FF]" size={32} />
                </div>
              ) : previewSvg ? (
                <div
                  style={{ width: "100%", height: "100%", lineHeight: 0 }}
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                  No preview available
                </div>
              )}
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
                disabled={isSubmitting || templateLoading}
                className="w-full bg-[#0055FF] hover:bg-[#0044DD] text-white font-medium py-3 rounded-xl"
              >
                {isSubmitting ? (
                  <><Loader2 size={16} className="animate-spin mr-2" /> Generating PDF…</>
                ) : (
                  "Send to Print"
                )}
              </Button>
              <p className="text-xs text-gray-400 text-center">
                Your design will be emailed to our print team. We'll be in touch.
              </p>
            </div>
          </div>
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
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
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

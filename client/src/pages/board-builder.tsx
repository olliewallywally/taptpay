import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type LayoutKey = "taptpay-a4-portrait" | "taptpay-a4-landscape" | "a4-portrait" | "a4-landscape" | "a6-portrait" | "a6-landscape";

const LAYOUTS: Record<LayoutKey, { label: string; mmW: number; mmH: number; pxW: number; pxH: number; aspect: number; branded?: boolean }> = {
  "taptpay-a4-portrait":  { label: "TaptPay A4 Portrait",  mmW: 210, mmH: 297, pxW: 794,  pxH: 1123, aspect: 297 / 210, branded: true },
  "taptpay-a4-landscape": { label: "TaptPay A4 Landscape", mmW: 297, mmH: 210, pxW: 1123, pxH: 794,  aspect: 210 / 297, branded: true },
  "a4-portrait":  { label: "A4 Portrait",  mmW: 210, mmH: 297, pxW: 794,  pxH: 1123, aspect: 297 / 210 },
  "a4-landscape": { label: "A4 Landscape", mmW: 297, mmH: 210, pxW: 1123, pxH: 794,  aspect: 210 / 297 },
  "a6-portrait":  { label: "A6 Portrait",  mmW: 105, mmH: 148, pxW: 397,  pxH: 559,  aspect: 148 / 105 },
  "a6-landscape": { label: "A6 Landscape", mmW: 148, mmH: 105, pxW: 559,  pxH: 397,  aspect: 105 / 148 },
};

const PRESET_COLORS = [
  { label: "TaptPay Teal",  value: "#00f1d7" },
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

interface MerchantData {
  id: number;
  businessName: string;
  email: string;
  paymentUrl?: string;
  qrCodeUrl?: string;
}

interface TaptStoneData {
  id: number;
  merchantId: number;
  name: string;
  stoneNumber: number;
  qrCodeUrl?: string | null;
  paymentUrl?: string | null;
  isActive: boolean | null;
}

async function fetchAsDataUrl(url: string, authToken?: string): Promise<string> {
  const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface BuildSvgOpts {
  svgTemplate: string;
  layout: LayoutKey;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  businessName: string;
  tagline: string;
  instructions: string;
  footer: string;
  qrDataUrl: string;
  logoDataUrl: string;
  selectedFont: string;
  customFontDataUrl: string;
  forCapture?: boolean;
}

function buildModifiedSvg(opts: BuildSvgOpts): string {
  const {
    svgTemplate, layout, primaryColor, backgroundColor, textColor,
    businessName, tagline, instructions,
    footer, qrDataUrl, logoDataUrl, selectedFont, customFontDataUrl, forCapture = false,
  } = opts;

  if (!svgTemplate) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgTemplate, "image/svg+xml");
  const svg = doc.documentElement;
  const dim = LAYOUTS[layout];

  svg.setAttribute("width", forCapture ? String(dim.pxW) : "100%");
  svg.setAttribute("height", forCapture ? String(dim.pxH) : "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Ensure <defs> exists
  let defsEl = svg.querySelector("defs");
  if (!defsEl) {
    defsEl = doc.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.insertBefore(defsEl, svg.firstChild);
  }

  // Get or create #font-style element
  const getOrCreate = (id: string, tag: string, parent: Element): Element => {
    const existing = doc.getElementById(id);
    if (existing) return existing;
    const el = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    el.id = id;
    parent.appendChild(el);
    return el;
  };

  const styleEl = getOrCreate("font-style", "style", defsEl);
  const bgVar = backgroundColor ? `--background: ${backgroundColor};` : "";
  const txtVar = textColor ? `--text: ${textColor};` : "";
  if (customFontDataUrl) {
    styleEl.textContent = `
      svg { --primary: ${primaryColor}; ${bgVar} ${txtVar} }
      @font-face { font-family: '__CustomFont__'; src: url('${customFontDataUrl}'); }
      text, tspan { font-family: '__CustomFont__', sans-serif !important; }
    `;
  } else {
    const gfUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(selectedFont)}:wght@400;600;700&display=swap`;
    styleEl.textContent = `
      svg { --primary: ${primaryColor}; ${bgVar} ${txtVar} }
      @import url('${gfUrl}');
      text, tspan { font-family: '${selectedFont}', sans-serif; }
    `;
  }

  // Primary colour (generic templates use a rect with id="color-primary")
  const colorEl = doc.getElementById("color-primary");
  if (colorEl) colorEl.setAttribute("fill", primaryColor);

  // Accent colour
  const accentEl = doc.getElementById("color-accent");
  if (accentEl) accentEl.setAttribute("fill", primaryColor);

  // Text elements helper
  const setText = (id: string, text: string, fill?: string): void => {
    const el = doc.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (fill) el.setAttribute("fill", fill);
  };

  setText("text-business-name", businessName || "Your Business Name", primaryColor);
  setText("text-tagline", tagline || "");

  // Payment instruction: multi-line support via <tspan> elements
  const instrEl = doc.getElementById("text-instructions");
  if (instrEl) {
    const rawInstr = instructions || "Scan to Pay";
    const instrLines = rawInstr.split("\n");
    const instrLineHeight = 188; // matches original SVG dy spacing
    const instrX = instrEl.getAttribute("x") || "1192.22";
    const instrBaseY = parseFloat(instrEl.getAttribute("y") || "2760.056");
    const instrStartY = instrBaseY - ((instrLines.length - 1) * instrLineHeight) / 2;
    while (instrEl.firstChild) instrEl.removeChild(instrEl.firstChild);
    instrLines.forEach((line, i) => {
      const tspan = doc.createElementNS("http://www.w3.org/2000/svg", "tspan");
      tspan.setAttribute("x", instrX);
      tspan.setAttribute("y", String(instrStartY + i * instrLineHeight));
      tspan.textContent = line;
      instrEl.appendChild(tspan);
    });
  }

  // Footer: multi-line support via <tspan> elements
  const footerEl = doc.getElementById("text-footer");
  if (footerEl) {
    const rawFooter = footer || "Powered by TaptPay";
    const lines = rawFooter.split("\n");
    const lineHeight = 100; // SVG user units (~font-size * 1.3)
    const xCenter = footerEl.getAttribute("x") || "1240";
    const baseY = parseFloat(footerEl.getAttribute("y") || "3440");
    // Centre the block around baseY
    const startY = baseY - ((lines.length - 1) * lineHeight) / 2;
    // Clear existing content
    while (footerEl.firstChild) footerEl.removeChild(footerEl.firstChild);
    lines.forEach((line, i) => {
      const tspan = doc.createElementNS("http://www.w3.org/2000/svg", "tspan");
      tspan.setAttribute("x", xCenter);
      tspan.setAttribute("y", String(startY + i * lineHeight));
      tspan.textContent = line;
      footerEl.appendChild(tspan);
    });
  }

  // QR code image (data URL from API)
  const setImg = (id: string, href: string): void => {
    const el = doc.getElementById(id);
    if (!el) return;
    el.setAttribute("href", href);
    el.setAttributeNS("http://www.w3.org/1999/xlink", "href", href);
  };

  setImg("qr-placeholder", qrDataUrl);
  setImg("logo-placeholder", logoDataUrl);

  return new XMLSerializer().serializeToString(svg);
}

export default function BoardBuilder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const captureRef = useRef<HTMLDivElement>(null);

  const merchantId = getCurrentMerchantId();
  const token = localStorage.getItem("authToken") ?? "";

  useEffect(() => {
    if (!merchantId) setLocation("/login?returnTo=/board-builder");
  }, [merchantId, setLocation]);

  const merchantQuery = useQuery<MerchantData>({
    queryKey: ["/api/merchants", merchantId],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch merchant");
      return res.json() as Promise<MerchantData>;
    },
    enabled: !!merchantId,
  });

  const stonesQuery = useQuery<TaptStoneData[]>({
    queryKey: ["/api/merchants", merchantId, "tapt-stones"],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}/tapt-stones`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stones");
      return res.json() as Promise<TaptStoneData[]>;
    },
    enabled: !!merchantId,
  });

  // Board state
  const [layout, setLayout] = useState<LayoutKey>("taptpay-a4-portrait");
  const [primaryColor, setPrimaryColor] = useState("#00f1d7");
  const [hexInput, setHexInput] = useState("#00f1d7");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [bgHexInput, setBgHexInput] = useState("");
  const [textColor, setTextColor] = useState("#888888");
  const [textHexInput, setTextHexInput] = useState("#888888");
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
  const [svgTemplate, setSvgTemplate] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [openSection, setOpenSection] = useState<string>("stone");

  // Load SVG template when layout changes (cache-busted to always get latest)
  useEffect(() => {
    setTemplateLoading(true);
    fetch(`/templates/${layout}.svg?v=${encodeURIComponent(import.meta.env.VITE_BUILD_TIME ?? Date.now())}`, { cache: "no-store" })
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

  // Load Google Font into document for live preview rendering
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

  // Pre-populate business name from merchant record (not used in TaptPay layout)
  useEffect(() => {
    if (layout === "taptpay-a4-portrait" || layout === "taptpay-a4-landscape") {
      setBusinessName("");
      return;
    }
    if (merchantQuery.data?.businessName && !businessName) {
      setBusinessName(merchantQuery.data.businessName);
    }
  }, [merchantQuery.data, layout]);

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

  const svgOpts: BuildSvgOpts = {
    svgTemplate,
    layout,
    primaryColor,
    backgroundColor,
    textColor,
    businessName,
    tagline,
    instructions,
    footer,
    qrDataUrl,
    logoDataUrl,
    selectedFont,
    customFontDataUrl,
  };

  // Memoized preview SVG (scaled to fit container)
  const previewSvg = useMemo(
    () => buildModifiedSvg({ ...svgOpts, forCapture: false }),
    [svgTemplate, layout, primaryColor, backgroundColor, textColor, businessName, tagline, instructions, footer, qrDataUrl, logoDataUrl, selectedFont, customFontDataUrl]
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
      const fontName = "__CustomFont__";
      const ff = new FontFace(fontName, `url(${dataUrl})`);
      ff.load().then((loaded) => {
        document.fonts.add(loaded);
        setCustomFontDataUrl(dataUrl);
        toast({ title: "Custom font loaded", description: file.name });
      }).catch(() => {
        toast({ title: "Failed to load font", variant: "destructive" });
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
      // Build full-size SVG for capture
      const captureSvg = buildModifiedSvg({ ...svgOpts, forCapture: true });

      // Inject SVG into the hidden capture div
      const captureEl = captureRef.current;
      if (!captureEl) throw new Error("Capture container not found");
      captureEl.innerHTML = captureSvg;

      // Wait for fonts to load and SVG to render
      await document.fonts.ready;
      await new Promise<void>((resolve) => setTimeout(resolve, 150));

      // Capture with html2canvas at 2× resolution
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
        const err = (await response.json()) as { message?: string };
        throw new Error(err.message ?? "Submission failed");
      }

      setSubmitted(true);
      toast({ title: "Sent! We'll get your board printed and in touch soon." });
    } catch (error: unknown) {
      console.error("PDF generation error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Failed to generate PDF", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggle = (section: string) => setOpenSection((s) => (s === section ? "" : section));
  const stones: TaptStoneData[] = stonesQuery.data ?? [];

  if (!merchantId) return null;

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-12 max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-[#00E5CC] mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Board Submitted!</h1>
          <p className="text-gray-600 mb-8">Your payment board design has been sent for printing. We'll be in touch shortly.</p>
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

      <div className="p-4 lg:p-6 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-[calc(100vh-57px)] items-start">

        {/* LEFT: Live Preview */}
        <div className="w-full lg:flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col items-center p-4 lg:p-6 gap-5 min-w-0">
          <div className="w-full text-center">
            <p className="text-sm text-gray-500 mb-3 font-medium">
              Live Preview — {dim.label} ({dim.mmW}×{dim.mmH}mm)
            </p>
            <div
              style={{
                width: "100%",
                maxWidth: Math.round(previewW),
                aspectRatio: `${dim.mmW} / ${dim.mmH}`,
                margin: "0 auto",
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
          <div className="w-full max-w-md bg-gray-50 rounded-2xl border border-gray-200 p-4 lg:p-5">
            <h3 className="font-semibold text-gray-900 mb-1">Ready to print?</h3>
            <p className="text-sm text-gray-500 mb-4">We'll email your board design as a PDF ready for printing.</p>
            <div className="space-y-3">
              <Input placeholder="Your name" value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} className="border-gray-200 focus:border-[#0055FF]" />
              <Input placeholder="Your email" type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} className="border-gray-200 focus:border-[#0055FF]" />
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

        {/* RIGHT: Edit Controls */}
        <div className="w-full lg:w-[360px] xl:w-[400px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-y-auto flex-shrink-0 max-h-[calc(100vh-90px)] lg:sticky lg:top-[73px]">
          <div className="p-4 space-y-1">

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

            <ControlSection icon={<Layout size={16} />} title="Layout" isOpen={openSection === "layout"} onToggle={() => toggle("layout")}>
              <div className="space-y-2">
                {/* TaptPay branded templates — 2-column grid */}
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide px-0.5">TaptPay Official</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["taptpay-a4-portrait", "taptpay-a4-landscape"] as LayoutKey[]).map((key) => {
                    const isPortrait = key === "taptpay-a4-portrait";
                    const active = layout === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setLayout(key)}
                        className={`relative border-2 rounded-xl p-3 flex flex-col items-center gap-2 text-left transition-all ${active ? "border-[#00f1d7] bg-[#00f1d7]/5" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <div className={`border-2 rounded mx-auto flex-shrink-0 ${isPortrait ? "w-7 h-9" : "w-9 h-7"} ${active ? "border-[#00f1d7]" : "border-gray-300"}`} />
                        <div className="text-center">
                          <div className={`text-[11px] font-semibold leading-tight ${active ? "text-[#00f1d7]" : "text-gray-700"}`}>{isPortrait ? "A4 Portrait" : "A4 Landscape"}</div>
                        </div>
                        {key === "taptpay-a4-portrait" && (
                          <span className="text-[9px] bg-[#00f1d7]/15 text-[#00b8a9] px-1.5 py-0.5 rounded-full font-medium">Recommended</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Generic templates — 2-column grid */}
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide px-0.5 pt-1">Blank</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(LAYOUTS) as LayoutKey[]).filter((k) => !LAYOUTS[k].branded).map((key) => (
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
              </div>
            </ControlSection>

            <ControlSection icon={<Palette size={16} />} title="Colour" isOpen={openSection === "colour"} onToggle={() => toggle("colour")}>
              <div className="space-y-4">

                {/* Accent colour */}
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Accent</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.value}
                        title={c.label}
                        onClick={() => handleColorChange(c.value)}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${primaryColor === c.value ? "border-gray-900 scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: primaryColor }} />
                    <Input value={hexInput} onChange={(e) => handleHexInput(e.target.value)} placeholder="#00f1d7" className="font-mono text-xs border-gray-200 focus:border-[#0055FF]" maxLength={7} />
                  </div>
                </div>

                {/* Background colour */}
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Background</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {[
                      { label: "None",        value: "" },
                      { label: "White",       value: "#ffffff" },
                      { label: "Cream",       value: "#fdf6e3" },
                      { label: "Light Grey",  value: "#f5f5f5" },
                      { label: "Dark Navy",   value: "#1a1a2e" },
                      { label: "Black",       value: "#111827" },
                    ].map((c) => (
                      <button
                        key={c.value}
                        title={c.label}
                        onClick={() => { setBackgroundColor(c.value); setBgHexInput(c.value); }}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${backgroundColor === c.value ? "border-gray-900 scale-110" : "border-gray-200"}`}
                        style={{ backgroundColor: c.value || "transparent", backgroundImage: c.value ? "none" : "linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0,4px 4px" }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: backgroundColor || "transparent" }} />
                    <Input value={bgHexInput} onChange={(e) => { setBgHexInput(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value) || e.target.value === "") setBackgroundColor(e.target.value); }} placeholder="None" className="font-mono text-xs border-gray-200 focus:border-[#0055FF]" maxLength={7} />
                  </div>
                </div>

                {/* Text colour */}
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Text</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {[
                      { label: "Grey",    value: "#888888" },
                      { label: "Dark",    value: "#111827" },
                      { label: "White",   value: "#ffffff" },
                      { label: "Teal",    value: "#00f1d7" },
                      { label: "Navy",    value: "#1a1a2e" },
                    ].map((c) => (
                      <button
                        key={c.value}
                        title={c.label}
                        onClick={() => { setTextColor(c.value); setTextHexInput(c.value); }}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${textColor === c.value ? "border-gray-900 scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: textColor }} />
                    <Input value={textHexInput} onChange={(e) => { setTextHexInput(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setTextColor(e.target.value); }} placeholder="#888888" className="font-mono text-xs border-gray-200 focus:border-[#0055FF]" maxLength={7} />
                  </div>
                </div>

              </div>
            </ControlSection>

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

            <ControlSection icon={<Type size={16} />} title="Text" isOpen={openSection === "text"} onToggle={() => toggle("text")}>
              <div className="space-y-3">
                {layout !== "taptpay-a4-portrait" && layout !== "taptpay-a4-landscape" && (
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Business Name</Label>
                    <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your Business Name" className="border-gray-200 focus:border-[#0055FF]" />
                  </div>
                )}
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Tagline (optional)</Label>
                  <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. Fresh coffee · Thorndon" className="border-gray-200 focus:border-[#0055FF]" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Payment Instruction</Label>
                  <Textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Scan to Pay"
                    rows={3}
                    className="border-gray-200 focus:border-[#0055FF] resize-none text-sm"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Press Enter to add a new line — text will be centred</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Footer Note</Label>
                  <Input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Powered by TaptPay" className="border-gray-200 focus:border-[#0055FF]" />
                </div>
              </div>
            </ControlSection>

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
      </div>

      {/* Hidden full-size capture div for html2canvas */}
      <div
        ref={captureRef}
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: dim.pxW,
          height: dim.pxH,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      />
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
      <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.22s ease" }}>
        <div style={{ overflow: "hidden" }}>
          <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-50">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

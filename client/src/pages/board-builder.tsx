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

type LayoutKey = "taptpay-a5-portrait" | "taptpay-a5-landscape";

const LAYOUTS: Record<LayoutKey, { label: string; mmW: number; mmH: number; pxW: number; pxH: number; aspect: number }> = {
  "taptpay-a5-portrait":  { label: "A5 Portrait",  mmW: 148, mmH: 210, pxW: 559,  pxH: 794,  aspect: 210 / 148 },
  "taptpay-a5-landscape": { label: "A5 Landscape", mmW: 210, mmH: 148, pxW: 794,  pxH: 559,  aspect: 148 / 210 },
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
  backgroundImageDataUrl?: string;
  textColor: string;
  iconColor: string;
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

// Converts a hex colour to a CSS filter that recolours source-teal PNG icons.
// Uses sepia as a neutral base then adjusts hue, saturation, brightness.
function hexToIconFilter(hex: string): string {
  if (!hex) return "";
  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d > 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    // sepia(1) yields hue ≈ 35°; rotate from there to target
    const rot = Math.round(h - 35);
    const sat = Math.round(s * 300); // amplify to saturate from sepia base
    const bri = Math.round(l * 200); // 50% lightness = 100% brightness
    return `sepia(1) hue-rotate(${rot}deg) saturate(${sat}%) brightness(${Math.max(bri, 15)}%)`;
  } catch { return ""; }
}

function buildModifiedSvg(opts: BuildSvgOpts): string {
  const {
    svgTemplate, layout, primaryColor, backgroundColor, backgroundImageDataUrl = "",
    textColor, iconColor, businessName, tagline, instructions,
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

  // Background image — injected immediately after #bg-fill so it covers the
  // colour rect and the template's own background image layers.
  const existingBgImg = doc.getElementById("bg-image");
  if (existingBgImg) existingBgImg.parentNode?.removeChild(existingBgImg);
  if (backgroundImageDataUrl) {
    const bgImg = doc.createElementNS("http://www.w3.org/2000/svg", "image");
    bgImg.id = "bg-image";
    bgImg.setAttribute("x", "0");
    bgImg.setAttribute("y", "0");
    bgImg.setAttribute("width", "100%");
    bgImg.setAttribute("height", "100%");
    bgImg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    bgImg.setAttribute("href", backgroundImageDataUrl);
    bgImg.setAttributeNS("http://www.w3.org/1999/xlink", "href", backgroundImageDataUrl);
    // Insert after #bg-fill so the uploaded image sits on top of colour fills
    const bgFillEl = doc.getElementById("bg-fill");
    if (bgFillEl?.parentNode) {
      bgFillEl.parentNode.insertBefore(bgImg, bgFillEl.nextSibling);
    } else {
      svg.appendChild(bgImg);
    }
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
  // When an image is uploaded it covers bg-fill, so force --background to transparent
  const bgVar = (backgroundColor && !backgroundImageDataUrl) ? `--background: ${backgroundColor};` : `--background: transparent;`;
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
    const rawInstr = instructions || "\nsimply tap or scan\nto pay";
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

  // Apply icon colour filter to the Paywave/NFC icon and QR image
  const iconFilter = hexToIconFilter(iconColor);
  if (iconFilter) {
    const iconIds = ["Layer_6.svg", "qr-placeholder"];
    iconIds.forEach((id) => {
      const el = doc.getElementById(id);
      if (el) el.setAttribute("style", `filter: ${iconFilter}`);
    });
  } else {
    // Clear any previously set filter so toggling back to "A" works
    ["Layer_6.svg", "qr-placeholder"].forEach((id) => {
      const el = doc.getElementById(id);
      if (el) el.removeAttribute("style");
    });
  }

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
  const [layout, setLayout] = useState<LayoutKey>("taptpay-a5-portrait");
  const [primaryColor, setPrimaryColor] = useState("#00f1d7");
  const [hexInput, setHexInput] = useState("#00f1d7");
  const [backgroundColor, setBackgroundColor] = useState("#0055FF");
  const [bgHexInput, setBgHexInput] = useState("#0055FF");
  const [backgroundImageDataUrl, setBackgroundImageDataUrl] = useState("");
  const [textColor, setTextColor] = useState("#888888");
  const [textHexInput, setTextHexInput] = useState("#888888");
  const [iconColor, setIconColor] = useState("");
  const [iconHexInput, setIconHexInput] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [tagline, setTagline] = useState("");
  const [instructions, setInstructions] = useState("\nsimply tap or scan\nto pay");
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

  // Pre-populate business name from merchant record
  useEffect(() => {
    if (merchantQuery.data?.businessName && !businessName) {
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

  const svgOpts: BuildSvgOpts = {
    svgTemplate,
    layout,
    primaryColor,
    backgroundColor,
    backgroundImageDataUrl,
    textColor,
    iconColor,
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
    [svgTemplate, layout, primaryColor, backgroundColor, backgroundImageDataUrl, textColor, iconColor, businessName, tagline, instructions, footer, qrDataUrl, logoDataUrl, selectedFont, customFontDataUrl]
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

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setBackgroundImageDataUrl(reader.result as string);
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
              <div className="space-y-3">
                <p className="text-xs text-gray-500">A5 size (148×210mm)</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["portrait", "landscape"] as const).map((orientation) => {
                    const key: LayoutKey = `taptpay-a5-${orientation}`;
                    const isPortrait = orientation === "portrait";
                    const active = layout === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setLayout(key)}
                        className={`relative border-2 rounded-xl p-3 flex flex-col items-center gap-2 transition-all ${active ? "border-[#00f1d7] bg-[#00f1d7]/5" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <div className={`border-2 rounded mx-auto flex-shrink-0 ${isPortrait ? "w-7 h-9" : "w-9 h-7"} ${active ? "border-[#00f1d7]" : "border-gray-300"}`} />
                        <div className={`text-[11px] font-semibold leading-tight ${active ? "text-[#00f1d7]" : "text-gray-700"}`}>
                          {isPortrait ? "Portrait" : "Landscape"}
                        </div>
                        {isPortrait && (
                          <span className="text-[9px] bg-[#00f1d7]/15 text-[#00b8a9] px-1.5 py-0.5 rounded-full font-medium">Recommended</span>
                        )}
                      </button>
                    );
                  })}
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
                  <div className={`space-y-2 ${backgroundImageDataUrl ? "opacity-40 pointer-events-none" : ""}`}>
                    <div className="flex flex-wrap gap-2">
                      {/* None / transparent option */}
                      <button
                        title="None (transparent)"
                        onClick={() => { setBackgroundColor(""); setBgHexInput(""); }}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${backgroundColor === "" ? "border-gray-900 scale-110" : "border-gray-200"}`}
                        style={{ backgroundImage: "linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0,4px 4px" }}
                      />
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c.value}
                          title={c.label}
                          onClick={() => { setBackgroundColor(c.value); setBgHexInput(c.value); }}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${backgroundColor === c.value ? "border-gray-900 scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: backgroundColor || "transparent" }} />
                      <Input value={bgHexInput} onChange={(e) => { setBgHexInput(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value) || e.target.value === "") setBackgroundColor(e.target.value); }} placeholder="None" className="font-mono text-xs border-gray-200 focus:border-[#0055FF]" maxLength={7} />
                    </div>
                  </div>

                  {/* Background image upload */}
                  <div className="mt-3">
                    {backgroundImageDataUrl ? (
                      <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                        <img src={backgroundImageDataUrl} className="h-10 w-16 object-cover rounded border border-gray-200 flex-shrink-0" alt="Background preview" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-600 font-medium">Background image set</p>
                          <p className="text-[10px] text-gray-400">Image overrides colour</p>
                        </div>
                        <Button variant="ghost" size="sm" className="text-gray-500 text-xs flex-shrink-0" onClick={() => setBackgroundImageDataUrl("")}>Remove</Button>
                      </div>
                    ) : (
                      <label className="block border-2 border-dashed border-gray-200 rounded-xl p-3 text-center cursor-pointer hover:border-[#0055FF] hover:bg-[#0055FF]/5 transition-all">
                        <Upload size={16} className="mx-auto text-gray-400 mb-1" />
                        <p className="text-xs text-gray-500">Upload background image</p>
                        <p className="text-xs text-gray-400">PNG, JPG · max 10MB</p>
                        <input type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={handleBgImageUpload} />
                      </label>
                    )}
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

                {/* Icons colour (QR border box + NFC box stroke) */}
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Icons &amp; Borders</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {/* Default — follows Accent colour */}
                    <button
                      title="Same as Accent"
                      onClick={() => { setIconColor(""); setIconHexInput(""); }}
                      className={`w-7 h-7 rounded-full border-2 transition-all text-[8px] font-bold flex items-center justify-center ${iconColor === "" ? "border-gray-900 scale-110" : "border-gray-200"}`}
                      style={{ backgroundColor: primaryColor, color: "#fff" }}
                    >A</button>
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.value}
                        title={c.label}
                        onClick={() => { setIconColor(c.value); setIconHexInput(c.value); }}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${iconColor === c.value ? "border-gray-900 scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full border border-gray-200 flex-shrink-0" style={{ backgroundColor: iconColor || primaryColor }} />
                    <Input value={iconHexInput} onChange={(e) => { setIconHexInput(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setIconColor(e.target.value); }} placeholder="Same as Accent" className="font-mono text-xs border-gray-200 focus:border-[#0055FF]" maxLength={7} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Tints the QR code and Paywave/NFC icon images</p>
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
                  <Textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="simply tap or scan to pay"
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

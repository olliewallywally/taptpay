import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Download, Share2, FileText, ArrowRight, CheckCircle } from "lucide-react";
import logoImage from "@assets/IMG_6592_1755070818452.png";

export default function InfoPage() {
  const isMobile = useIsMobile();
  const pdfSrc = isMobile ? "/info-pack-mobile.pdf" : "/info-pack-web.pdf";
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const INFO_URL = "https://taptpay.co.nz/info";

  useEffect(() => {
    if (isMobile) return;
    import("qrcode").then((QRCode) => {
      const opts = {
        errorCorrectionLevel: "H" as const,
        margin: 2,
        width: 300,
        color: { dark: "#000a36", light: "#00000000" },
      };
      if (qrRef.current) {
        QRCode.default.toCanvas(qrRef.current, INFO_URL, opts);
      }
      QRCode.default.toDataURL(INFO_URL, opts).then(setQrDataUrl);
    });
  }, [isMobile]);

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = "taptpay-info-qr.png";
    a.click();
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "TaptPay Info Pack", url: INFO_URL });
    } else {
      await navigator.clipboard.writeText(INFO_URL);
      alert("Link copied!");
    }
  };

  const highlights = [
    "100% digital POS system — no hardware needed",
    "$0.10 per transaction, no lock-in contracts",
    "QR code & NFC payment boards",
    "Real-time dashboard & analytics",
    "Split bill & shareable payment requests",
    "Free technical support",
  ];

  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#0055ff", fontFamily: "Outfit, sans-serif" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-8 pb-4">
          <img
            src={logoImage}
            alt="TaptPay"
            className="h-7 w-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          />
          <button
            onClick={handleShare}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <Share2 className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Hero */}
        <div className="px-5 pt-6 pb-8">
          <p className="text-[#00f1d7] text-xs uppercase tracking-[0.2em] mb-3">info pack 2026</p>
          <h1 className="text-white text-4xl font-light leading-tight mb-4">
            the smarter<br />way to take<br />payments.
          </h1>
          <p className="text-white/60 text-sm leading-relaxed">
            New Zealand's 100% digital POS system. No hardware, no contracts — just simple, affordable payments.
          </p>
        </div>

        {/* Highlights */}
        <div className="mx-5 bg-white/10 rounded-3xl p-5 mb-6">
          <ul className="space-y-3">
            {highlights.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle className="w-4 h-4 text-[#00f1d7] flex-shrink-0 mt-0.5" />
                <span className="text-white/90 text-sm leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA buttons */}
        <div className="px-5 space-y-3 pb-10">
          <a
            href={pdfSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-[#00f1d7] text-[#000a36] font-semibold rounded-full py-4 text-base"
          >
            <FileText className="w-5 h-5" />
            Open Info Pack PDF
            <ArrowRight className="w-4 h-4 ml-1" />
          </a>
          <a
            href={pdfSrc}
            download="TaptPay-Info-Pack.pdf"
            className="flex items-center justify-center gap-2 w-full bg-white/10 text-white font-medium rounded-full py-4 text-base border border-white/20"
          >
            <Download className="w-5 h-5" />
            Download PDF
          </a>
        </div>

        {/* Footer */}
        <div className="mt-auto px-5 pb-8 text-center">
          <p className="text-white/30 text-xs">© 2026 TaptPay · 100% Kiwi owned & operated</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000a36] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#000a36] border-b border-white/10 flex-shrink-0">
        <img
          src={logoImage}
          alt="TaptPay"
          className="h-7 w-auto"
          style={{ filter: "brightness(0) saturate(100%) invert(78%) sepia(96%) saturate(2453%) hue-rotate(131deg) brightness(97%) contrast(101%)" }}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs px-3 py-1.5 rounded-full border border-white/20 hover:border-white/50 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </button>
          <a
            href={pdfSrc}
            download="TaptPay-Info-Pack.pdf"
            className="flex items-center gap-1.5 bg-[#00f1d7] hover:bg-white text-[#000a36] text-xs font-semibold px-4 py-2 rounded-full transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </a>
        </div>
      </div>

      {/* PDF viewer */}
      <div className="flex-1 min-h-0">
        <iframe
          src={pdfSrc}
          title="TaptPay Info Pack"
          className="w-full h-full border-0"
          style={{ minHeight: "calc(100vh - 52px)" }}
        />
      </div>

      {/* QR code for desktop */}
      <div className="bg-[#000a36] border-t border-white/10 py-10 px-6 flex flex-col items-center gap-5">
        <p className="text-white/50 text-xs uppercase tracking-widest">scan to open on mobile</p>
        <canvas ref={qrRef} />
        <p className="text-white/30 text-xs">{INFO_URL}</p>
        <button
          onClick={handleDownloadQR}
          className="flex items-center gap-2 bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold px-5 py-2 rounded-full text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          Download QR Code
        </button>
      </div>
    </div>
  );
}

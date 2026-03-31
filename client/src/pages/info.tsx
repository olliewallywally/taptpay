import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Download, Share2 } from "lucide-react";

export default function InfoPage() {
  const isMobile = useIsMobile();
  const pdfSrc = isMobile ? "/info-pack-mobile.pdf" : "/info-pack-web.pdf";
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const INFO_URL = "https://taptpay.co.nz/info";

  useEffect(() => {
    import("qrcode").then((QRCode) => {
      const opts = {
        errorCorrectionLevel: "H" as const,
        margin: 2,
        width: 300,
        color: { dark: "#000a36", light: "#ffffff" },
      };
      if (qrRef.current) {
        QRCode.default.toCanvas(qrRef.current, INFO_URL, opts);
      }
      QRCode.default.toDataURL(INFO_URL, opts).then(setQrDataUrl);
    });
  }, []);

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = "taptpay-info-qr.png";
    a.click();
  };

  const handleDownloadPDF = () => {
    const a = document.createElement("a");
    a.href = pdfSrc;
    a.download = isMobile ? "TaptPay-Info-Mobile.pdf" : "TaptPay-Info.pdf";
    a.click();
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "TaptPay Info Pack", url: INFO_URL });
    } else {
      await navigator.clipboard.writeText(INFO_URL);
      alert("Link copied to clipboard!");
    }
  };

  return (
    <div className="min-h-screen bg-[#000a36] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#000a36] border-b border-white/10 flex-shrink-0">
        <img
          src="/icons/icon-192.png"
          alt="TaptPay"
          className="h-7 w-auto"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <span className="text-[#00f1d7] font-semibold text-sm tracking-wide">
          info pack
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs px-2 py-1.5 rounded-full border border-white/20 hover:border-white/50 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 bg-[#00f1d7] hover:bg-white text-[#000a36] text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* PDF viewer — fills remaining height */}
      <div className="flex-1 min-h-0">
        <iframe
          src={pdfSrc}
          title="TaptPay Info Pack"
          className="w-full h-full border-0"
          style={{ minHeight: "calc(100vh - 52px)" }}
        />
      </div>

      {/* QR code section — shown below PDF on desktop for easy download */}
      {!isMobile && (
        <div className="bg-[#000a36] border-t border-white/10 py-10 px-6 flex flex-col items-center gap-5">
          <p className="text-white/50 text-sm uppercase tracking-widest">
            scan to open on mobile
          </p>
          <div className="bg-white p-4 rounded-2xl shadow-xl">
            <canvas ref={qrRef} />
          </div>
          <p className="text-white/40 text-xs">{INFO_URL}</p>
          <button
            onClick={handleDownloadQR}
            className="flex items-center gap-2 bg-[#00f1d7] hover:bg-white text-[#000a36] font-semibold px-5 py-2 rounded-full text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Download QR Code
          </button>
        </div>
      )}
    </div>
  );
}

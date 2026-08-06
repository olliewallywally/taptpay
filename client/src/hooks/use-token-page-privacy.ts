import { useEffect } from "react";

/**
 * The server sets the same policy before token-route HTML is served. This
 * client-side guard keeps SPA navigations equally strict before any payment
 * SDK or merchant asset is loaded.
 */
export function useTokenPagePrivacy(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const previous = existing?.content;
    const meta = existing ?? document.createElement("meta");
    if (!existing) {
      meta.name = "referrer";
      meta.dataset.taptpayTokenPrivacy = "true";
      document.head.appendChild(meta);
    }
    meta.content = "no-referrer";

    return () => {
      if (meta.dataset.taptpayTokenPrivacy === "true") meta.remove();
      else if (previous != null) meta.content = previous;
    };
  }, [enabled]);
}

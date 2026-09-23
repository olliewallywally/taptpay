/**
 * Utility functions for generating proper URLs based on the current environment
 */
import { config } from "./config";

export function getBaseUrl(req?: any): string {
  // In production, use the configured production domain for stable callback URLs
  if (config.publicOrigin) {
    return config.publicOrigin;
  }
  if (config.legacyDomains.productionDomain) {
    return `https://${config.legacyDomains.productionDomain}`;
  }

  // In production (Replit), use the REPLIT_DOMAINS environment variable
  if (config.legacyDomains.replitDomains) {
    const domain = config.legacyDomains.replitDomains.split(',')[0];
    return `https://${domain}`;
  }
  
  // In development, from the request: its protocol as Express reads it, which believes
  // X-Forwarded-Proto only from a trusted proxy (TRUST_PROXY_HOPS), and its Host. Never
  // a raw X-Forwarded-* header: any visitor can write one, and a reset link built from
  // it would point wherever they chose (R1-T4 phase B).
  if (req) {
    const protocol = req.protocol || 'http';
    const host = req.headers?.host || 'localhost:5000';
    return `${protocol}://${host}`;
  }
  
  // Fallback for development
  return 'http://localhost:5000';
}

export function generatePaymentUrl(merchantId: number, stoneId?: number | null, req?: any): string {
  const baseUrl = getBaseUrl(req);
  if (stoneId) {
    // Ensure stoneId is converted to number to prevent [object Object] in URL
    const stoneIdNumber = typeof stoneId === 'number' ? stoneId : parseInt(String(stoneId));
    return `${baseUrl}/pay/${merchantId}/stone/${stoneIdNumber}`;
  }
  return `${baseUrl}/pay/${merchantId}`;
}

export function generateQrCodeUrl(merchantId: number, stoneId?: number | null, req?: any): string {
  const baseUrl = getBaseUrl(req);
  if (stoneId) {
    // Ensure stoneId is converted to number to prevent [object Object] in URL
    const stoneIdNumber = typeof stoneId === 'number' ? stoneId : parseInt(String(stoneId));
    return `${baseUrl}/api/merchants/${merchantId}/stone/${stoneIdNumber}/qr`;
  }
  return `${baseUrl}/api/merchants/${merchantId}/qr`;
}

export function generateStonePaymentUrl(merchantId: number, stoneId: number, req?: any): string {
  const baseUrl = getBaseUrl(req);
  // Ensure stoneId is converted to number to prevent [object Object] in URL
  const stoneIdNumber = typeof stoneId === 'number' ? stoneId : parseInt(String(stoneId));
  return `${baseUrl}/pay/${merchantId}/stone/${stoneIdNumber}`;
}

/**
 * Generates the URL to programme into a physical NFC tag.
 * Hits a server-side redirect that sends Android users to Chrome via
 * intent:// and iOS users straight to the HTTPS pay URL.
 */
export function generateNfcTagUrl(merchantId: number, stoneId?: number | null, req?: any): string {
  const baseUrl = getBaseUrl(req);
  if (stoneId) {
    const stoneIdNumber = typeof stoneId === 'number' ? stoneId : parseInt(String(stoneId));
    return `${baseUrl}/nfc/${merchantId}/stone/${stoneIdNumber}`;
  }
  return `${baseUrl}/nfc/${merchantId}`;
}

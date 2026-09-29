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

/**
 * A payment board's customer page. There is no business-wide no-board address: it was
 * retired on 2026-09-25 (server/no-board-address.ts), and a sale without a board has its
 * own link, given once when the sale is made. So a board is required.
 */
export function generatePaymentUrl(merchantId: number, stoneId: number, req?: any): string {
  return generateStonePaymentUrl(merchantId, stoneId, req);
}

/** A payment board's QR image (see generatePaymentUrl). */
export function generateQrCodeUrl(merchantId: number, stoneId: number, req?: any): string {
  const baseUrl = getBaseUrl(req);
  // Ensure stoneId is converted to number to prevent [object Object] in URL
  const stoneIdNumber = typeof stoneId === 'number' ? stoneId : parseInt(String(stoneId));
  return `${baseUrl}/api/merchants/${merchantId}/stone/${stoneIdNumber}/qr`;
}

export function generateStonePaymentUrl(merchantId: number, stoneId: number, req?: any): string {
  const baseUrl = getBaseUrl(req);
  // Ensure stoneId is converted to number to prevent [object Object] in URL
  const stoneIdNumber = typeof stoneId === 'number' ? stoneId : parseInt(String(stoneId));
  return `${baseUrl}/pay/${merchantId}/stone/${stoneIdNumber}`;
}

/**
 * A board sale's address, its board's page and QR image; none for a sale without a board,
 * whose own link can't be rebuilt (only its hash is kept).
 */
export function boardSaleUrls(
  merchantId: number,
  stoneId: number | null | undefined,
  req?: any,
): { paymentUrl?: string; qrCodeUrl?: string } {
  if (stoneId == null) return {};
  return {
    paymentUrl: generatePaymentUrl(merchantId, stoneId, req),
    qrCodeUrl: generateQrCodeUrl(merchantId, stoneId, req),
  };
}

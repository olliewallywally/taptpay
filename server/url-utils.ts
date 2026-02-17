/**
 * Utility functions for generating proper URLs based on the current environment
 */

export function getBaseUrl(req?: any): string {
  // In production, use the configured production domain for stable callback URLs
  if (process.env.PRODUCTION_DOMAIN) {
    return `https://${process.env.PRODUCTION_DOMAIN}`;
  }

  // In production (Replit), use the REPLIT_DOMAINS environment variable
  if (process.env.REPLIT_DOMAINS) {
    const domain = process.env.REPLIT_DOMAINS.split(',')[0];
    return `https://${domain}`;
  }
  
  // In development, try to get from request headers
  if (req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5000';
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
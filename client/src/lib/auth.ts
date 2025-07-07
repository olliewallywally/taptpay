// Utility functions for authentication

export function decodeJWT(token: string): any {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

export function getCurrentUser(): any {
  const token = localStorage.getItem('authToken');
  if (!token) return null;
  
  return decodeJWT(token);
}

export function getCurrentMerchantId(): number | null {
  const user = getCurrentUser();
  return user?.merchantId || null;
}
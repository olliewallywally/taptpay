import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { heldSession } from '@/lib/session';

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

// R1-T4 phase E: the admin's sign-in is a session cookie the page cannot read; the page knows it only
// from the admin area's start-up check (lib/session.ts readAdminSession).
export function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const [, setLocation] = useLocation();
  const session = heldSession('admin');
  const isAdmin = session?.user.role === 'admin';

  useEffect(() => {
    if (!isAdmin) setLocation('/login');
  }, [isAdmin, setLocation]);

  return isAdmin ? <>{children}</> : null;
}

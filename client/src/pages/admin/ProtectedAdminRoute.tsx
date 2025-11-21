import { useEffect } from 'react';
import { useLocation } from 'wouter';

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

export function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const adminToken = localStorage.getItem('adminAuthToken');
    const adminUser = localStorage.getItem('adminUser');

    if (!adminToken || !adminUser) {
      setLocation('/login');
      return;
    }

    try {
      const user = JSON.parse(adminUser);
      if (user.role !== 'admin') {
        setLocation('/login');
      }
    } catch (error) {
      console.error('Invalid admin user data:', error);
      setLocation('/login');
    }
  }, [setLocation]);

  const adminToken = localStorage.getItem('adminAuthToken');
  const adminUser = localStorage.getItem('adminUser');

  if (!adminToken || !adminUser) {
    return null;
  }

  try {
    const user = JSON.parse(adminUser);
    if (user.role !== 'admin') {
      return null;
    }
  } catch (error) {
    return null;
  }

  return <>{children}</>;
}

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { Alert, Spinner } from './ui';

/**
 * UI-side guard. Purely for user experience: the real protection is the
 * API's requireRole middleware, which the browser can't bypass.
 */
export default function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Alert>You don’t have access to this page.</Alert>;
  return <>{children}</>;
}

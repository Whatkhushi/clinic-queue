import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // On page load, try to restore the session from the refresh cookie.
  useEffect(() => {
    refreshSession()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  async function handleSession(path: string, body: unknown) {
    const data = await api<{ accessToken: string; user: User }>(path, { method: 'POST', body });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  const value: AuthState = {
    user,
    loading,
    login: (email, password) => handleSession('/auth/login', { email, password }),
    register: (name, email, password) => handleSession('/auth/register', { name, email, password }),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where each role lands after logging in. */
export function homeFor(user: User) {
  if (user.role === 'ADMIN') return '/admin';
  if (user.role === 'STAFF') return '/staff';
  return '/my';
}

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSessionExpired, tokenStore } from './api';
import type { Profile, RoleName, Session } from './types';

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  role: RoleName;
  requestOtp: (phone: string) => Promise<{ expiresInSec: number; devCode?: string }>;
  verifyOtp: (phone: string, code: string, name?: string) => Promise<Profile>;
  loginWithPassword: (phone: string, password: string) => Promise<Profile>;
  /** Creates a password account for this app's role (customer, rider or vendor). */
  register: (input: { name: string; phone: string; password: string }) => Promise<Profile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ role, children }: { role: RoleName; children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!tokenStore.access && !tokenStore.refresh) {
      setUser(null);
      return null;
    }
    try {
      const me = await api<Profile>('/auth/me');
      setUser(me);
      return me;
    } catch {
      tokenStore.clear();
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshProfile().finally(() => setLoading(false));
    return onSessionExpired(() => setUser(null));
  }, [refreshProfile]);

  const accept = useCallback((session: Session) => {
    tokenStore.set(session.accessToken, session.refreshToken);
    setUser(session.user);
    return session.user;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      role,
      requestOtp: (phone) => api('/auth/otp/request', { body: { phone }, auth: false }),
      verifyOtp: async (phone, code, name) =>
        accept(await api<Session>('/auth/otp/verify', { body: { phone, code, role, name }, auth: false })),
      loginWithPassword: async (phone, password) =>
        accept(await api<Session>('/auth/login', { body: { phone, password, role: role === 'VENDOR' ? undefined : role }, auth: false })),
      register: async ({ name, phone, password }) =>
        accept(await api<Session>('/auth/register', { body: { name, phone, password, role }, auth: false })),
      logout: async () => {
        const refreshToken = tokenStore.refresh;
        tokenStore.clear();
        setUser(null);
        if (refreshToken) await api('/auth/logout', { body: { refreshToken }, auth: false }).catch(() => undefined);
      },
      refreshProfile,
    }),
    [user, loading, role, accept, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

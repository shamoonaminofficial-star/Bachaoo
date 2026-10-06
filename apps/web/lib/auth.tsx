'use client';
/**
 * AuthProvider — React context for the Bachatly session.
 *
 * Token contract (see README "Authentication"):
 * - Access token (15 min): kept IN MEMORY ONLY (auth-client.ts), plus sent as
 *   `Authorization: Bearer` on API calls.
 * - Refresh token (30 days, rotated): httpOnly `bachatly_rt` cookie, set and
 *   read only by the Next.js /api/auth/* route handlers. Client JS never sees it.
 * - Roles: httpOnly `bachatly_roles` cookie set server-side at login; the
 *   middleware reads it for role-gated routes.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getAccessToken,
  setAccessToken,
  refreshSession,
  serverLogout,
} from './auth-client';

export interface AuthUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  firstName: string;
  lastName: string;
  roles?: string[];
  [key: string]: unknown;
}

export interface LoginInput {
  emailOrPhone: string;
  password: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  cityId?: string;
  acceptTerms: boolean;
  referralCode?: string;
}

export class SessionError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  constructor(status: number, message: string, code?: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const PARTNER_ROLES = ['BUSINESS_OWNER', 'BUSINESS_MANAGER', 'CASHIER', 'SCANNER'];
export const ADMIN_ROLES = [
  'SUPER_ADMIN',
  'ADMINISTRATOR',
  'ADMIN',
  'SUPPORT_AGENT',
  'CONTENT_MANAGER',
  'FINANCE_MANAGER',
  'MARKETING_MANAGER',
];

/** Role-appropriate landing page after login. */
export function dashboardForRoles(roles: string[]): string {
  if (roles.some((r) => ADMIN_ROLES.includes(r))) return '/admin';
  if (roles.some((r) => PARTNER_ROLES.includes(r))) return '/partner/dashboard';
  return '/account';
}

interface AuthContextValue {
  user: AuthUser | null;
  roles: string[];
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<{ user: AuthUser; roles: string[] }>;
  register: (input: RegisterInput) => Promise<{ user: AuthUser; roles: string[] }>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function postSession(path: 'login' | 'register', body: unknown) {
  const res = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SessionError(
      res.status,
      data.message || `Request failed (${res.status})`,
      data.code,
      data.fields,
    );
  }
  return data as { user: AuthUser; accessToken: string; roles: string[]; expiresIn: number };
}

/** Refresh ~2 minutes before the 15-minute access token expires. */
const REFRESH_SKEW_MS = 2 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const scheduleSilentRefresh = useCallback((expiresInSec: number) => {
    clearTimer();
    const delay = Math.max(expiresInSec * 1000 - REFRESH_SKEW_MS, 30_000);
    timer.current = setTimeout(async () => {
      const token = await refreshSession();
      if (token) scheduleSilentRefresh(900);
      else {
        setUser(null);
        setRoles([]);
        setPermissions([]);
      }
    }, delay);
  }, []);

  const applySession = useCallback(
    (data: { user: AuthUser; accessToken: string; roles: string[]; expiresIn: number; permissions?: string[] }) => {
      setAccessToken(data.accessToken);
      setUser(data.user);
      const r = Array.isArray(data.roles) ? data.roles : [];
      setRoles(r);
      setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
      scheduleSilentRefresh(data.expiresIn || 900);
    },
    [scheduleSilentRefresh],
  );

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) {
        const token = await refreshSession();
        if (!token) {
          setUser(null);
          setRoles([]);
          return;
        }
        const retry = await fetch('/api/auth/me');
        if (!retry.ok) {
          setUser(null);
          setRoles([]);
          return;
        }
        const data = await retry.json();
        setUser(data.user ?? null);
        setRoles(Array.isArray(data.roles) ? data.roles : []);
        return;
      }
      if (!res.ok) {
        setUser(null);
        setRoles([]);
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);
      setRoles(Array.isArray(data.roles) ? data.roles : []);
      if (getAccessToken()) scheduleSilentRefresh(900);
    } catch {
      setUser(null);
      setRoles([]);
    }
  }, [scheduleSilentRefresh]);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setIsLoading(false);
    })();
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      const data = await postSession('login', input);
      applySession(data);
      return { user: data.user, roles: data.roles ?? [] };
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const data = await postSession('register', input);
      applySession(data);
      return { user: data.user, roles: data.roles ?? [] };
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    clearTimer();
    await serverLogout();
    setUser(null);
    setRoles([]);
    setPermissions([]);
  }, []);

  const refresh = useCallback(async () => {
    const token = await refreshSession();
    if (token) {
      scheduleSilentRefresh(900);
      return true;
    }
    setUser(null);
    setRoles([]);
    return false;
  }, [scheduleSilentRefresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      roles,
      permissions,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refresh,
      refreshUser,
    }),
    [user, roles, permissions, isLoading, login, register, logout, refresh, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

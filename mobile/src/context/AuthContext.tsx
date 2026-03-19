import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from '../lib/api';
import type { AuthResponse, UserProfile } from '../types';

const ACCESS_TOKEN_KEY = 'proactive_access_token';
const REFRESH_TOKEN_KEY = 'proactive_refresh_token';
const ACTIVE_ORG_KEY = 'proactive_active_org';

type AuthContextValue = {
  isReady: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  user: UserProfile | null;
  activeOrganizationId: string | null;
  activeRole: string | null;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: { email: string; password: string; fullName: string }) => Promise<void>;
  logout: () => void;
  selectOrganization: (organizationId: string) => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const mapAuthResponse = async (response: AuthResponse) => {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, response.access_token);
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
  const defaultOrg = response.user.organizations[0]?.id;
  const existingOrg = await AsyncStorage.getItem(ACTIVE_ORG_KEY);
  const activeOrg =
    existingOrg && response.user.organizations.some((o) => o.id === existingOrg)
      ? existingOrg
      : defaultOrg;
  if (activeOrg) {
    await AsyncStorage.setItem(ACTIVE_ORG_KEY, activeOrg);
  }
  return {
    accessToken: response.access_token,
    user: response.user,
    activeOrganizationId: activeOrg ?? null,
  };
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isReady, setIsReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);

  const refreshMe = async () => {
    if (!accessToken) return;
    const profile = await apiRequest<UserProfile>('/auth/me', { token: accessToken });
    setUser(profile);
    const stored = await AsyncStorage.getItem(ACTIVE_ORG_KEY);
    if (stored && profile.organizations.some((o) => o.id === stored)) {
      setActiveOrganizationId(stored);
      return;
    }
    const fallback = profile.organizations[0]?.id ?? null;
    setActiveOrganizationId(fallback);
    if (fallback) {
      await AsyncStorage.setItem(ACTIVE_ORG_KEY, fallback);
    }
  };

  useEffect(() => {
    const boot = async () => {
      const storedAccess = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
      const storedRefresh = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
      const storedOrg = await AsyncStorage.getItem(ACTIVE_ORG_KEY);

      if (!storedAccess || !storedRefresh) {
        setIsReady(true);
        return;
      }

      setAccessToken(storedAccess);
      if (storedOrg) setActiveOrganizationId(storedOrg);

      try {
        const profile = await apiRequest<UserProfile>('/auth/me', { token: storedAccess });
        setUser(profile);
      } catch {
        try {
          const response = await apiRequest<AuthResponse>('/auth/refresh', {
            method: 'POST',
            body: { refresh_token: storedRefresh },
          });
          const mapped = await mapAuthResponse(response);
          setAccessToken(mapped.accessToken);
          setUser(mapped.user);
          setActiveOrganizationId(mapped.activeOrganizationId);
        } catch {
          await Promise.all([
            AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
            AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
            AsyncStorage.removeItem(ACTIVE_ORG_KEY),
          ]);
          setAccessToken(null);
          setUser(null);
          setActiveOrganizationId(null);
        }
      }
      setIsReady(true);
    };
    void boot();
  }, []);

  const login = async ({ email, password }: { email: string; password: string }) => {
    console.log('[Auth] login attempt', email);
    const response = await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    const mapped = await mapAuthResponse(response);
    setAccessToken(mapped.accessToken);
    setUser(mapped.user);
    setActiveOrganizationId(mapped.activeOrganizationId);
  };

  const register = async ({
    email,
    password,
    fullName,
  }: {
    email: string;
    password: string;
    fullName: string;
  }) => {
    const response = await apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { email, password, full_name: fullName },
    });
    const mapped = await mapAuthResponse(response);
    setAccessToken(mapped.accessToken);
    setUser(mapped.user);
    setActiveOrganizationId(mapped.activeOrganizationId);
  };

  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(ACTIVE_ORG_KEY),
    ]);
    setAccessToken(null);
    setUser(null);
    setActiveOrganizationId(null);
  };

  const selectOrganization = (organizationId: string) => {
    AsyncStorage.setItem(ACTIVE_ORG_KEY, organizationId);
    setActiveOrganizationId(organizationId);
  };

  const activeRole = useMemo(() => {
    if (!user || !activeOrganizationId) return null;
    return user.memberships.find((m) => m.organization_id === activeOrganizationId)?.role ?? null;
  }, [user, activeOrganizationId]);

  return (
    <AuthContext.Provider
      value={{
        isReady,
        isAuthenticated: Boolean(accessToken && user),
        accessToken,
        user,
        activeOrganizationId,
        activeRole,
        login,
        register,
        logout,
        selectOrganization,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

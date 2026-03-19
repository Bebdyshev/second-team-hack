'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { apiRequest } from '@/lib/api'
import type { AuthResponse, UserProfile } from '@/lib/types'

type AuthContextValue = {
  isReady: boolean
  isAuthenticated: boolean
  accessToken: string | null
  refreshToken: string | null
  user: UserProfile | null
  activeOrganizationId: string | null
  activeRole: string | null
  login: (payload: { email: string; password: string }) => Promise<void>
  register: (payload: { email: string; password: string; fullName: string }) => Promise<void>
  logout: () => void
  selectOrganization: (organizationId: string) => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ACCESS_TOKEN_KEY = 'proactive_access_token'
const REFRESH_TOKEN_KEY = 'proactive_refresh_token'
const ACTIVE_ORG_KEY = 'proactive_active_org'
const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24
const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

const getCookie = (name: string) => {
  if (typeof document == 'undefined') return null
  const parts = document.cookie.split(';').map((item) => item.trim())
  const prefix = `${name}=`
  const tokenPart = parts.find((item) => item.startsWith(prefix))
  if (!tokenPart) return null
  return decodeURIComponent(tokenPart.slice(prefix.length))
}

const setCookie = (name: string, value: string, maxAgeSeconds: number) => {
  if (typeof document == 'undefined') return
  const isSecureContext = typeof window != 'undefined' && window.location.protocol == 'https:'
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${isSecureContext ? '; Secure' : ''}`
}

const removeCookie = (name: string) => {
  if (typeof document == 'undefined') return
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
}

const mapAuthResponse = (response: AuthResponse) => {
  setCookie(ACCESS_TOKEN_KEY, response.access_token, ACCESS_TOKEN_MAX_AGE_SECONDS)
  setCookie(REFRESH_TOKEN_KEY, response.refresh_token, REFRESH_TOKEN_MAX_AGE_SECONDS)
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)

  const defaultOrg = response.user.organizations[0]?.id
  const existingOrg = localStorage.getItem(ACTIVE_ORG_KEY)
  const activeOrg = existingOrg && response.user.organizations.some((item) => item.id == existingOrg) ? existingOrg : defaultOrg

  if (activeOrg) {
    localStorage.setItem(ACTIVE_ORG_KEY, activeOrg)
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    user: response.user,
    activeOrganizationId: activeOrg ?? null,
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isReady, setIsReady] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null)

  const refreshMe = async () => {
    if (!accessToken) return
    const profile = await apiRequest<UserProfile>('/auth/me', { token: accessToken })
    setUser(profile)

    const stored = localStorage.getItem(ACTIVE_ORG_KEY)
    if (stored && profile.organizations.some((item) => item.id == stored)) {
      setActiveOrganizationId(stored)
      return
    }

    const fallback = profile.organizations[0]?.id ?? null
    setActiveOrganizationId(fallback)
    if (fallback) {
      localStorage.setItem(ACTIVE_ORG_KEY, fallback)
    }
  }

  useEffect(() => {
    const boot = async () => {
      const cookieAccess = getCookie(ACCESS_TOKEN_KEY)
      const cookieRefresh = getCookie(REFRESH_TOKEN_KEY)
      const legacyAccess = localStorage.getItem(ACCESS_TOKEN_KEY)
      const legacyRefresh = localStorage.getItem(REFRESH_TOKEN_KEY)
      const storedAccess = cookieAccess ?? legacyAccess
      const storedRefresh = cookieRefresh ?? legacyRefresh
      const storedOrg = localStorage.getItem(ACTIVE_ORG_KEY)

      if (!storedAccess || !storedRefresh) {
        setIsReady(true)
        return
      }

      if (!cookieAccess && legacyAccess) {
        setCookie(ACCESS_TOKEN_KEY, legacyAccess, ACCESS_TOKEN_MAX_AGE_SECONDS)
        localStorage.removeItem(ACCESS_TOKEN_KEY)
      }
      if (!cookieRefresh && legacyRefresh) {
        setCookie(REFRESH_TOKEN_KEY, legacyRefresh, REFRESH_TOKEN_MAX_AGE_SECONDS)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
      }

      setAccessToken(storedAccess)
      setRefreshToken(storedRefresh)
      if (storedOrg) {
        setActiveOrganizationId(storedOrg)
      }

      try {
        const profile = await apiRequest<UserProfile>('/auth/me', { token: storedAccess })
        setUser(profile)
      } catch {
        try {
          const response = await apiRequest<AuthResponse>('/auth/refresh', {
            method: 'POST',
            body: { refresh_token: storedRefresh },
          })
          const mapped = mapAuthResponse(response)
          setAccessToken(mapped.accessToken)
          setRefreshToken(mapped.refreshToken)
          setUser(mapped.user)
          setActiveOrganizationId(mapped.activeOrganizationId)
        } catch {
          removeCookie(ACCESS_TOKEN_KEY)
          removeCookie(REFRESH_TOKEN_KEY)
          localStorage.removeItem(ACCESS_TOKEN_KEY)
          localStorage.removeItem(REFRESH_TOKEN_KEY)
          localStorage.removeItem(ACTIVE_ORG_KEY)
        }
      }

      setIsReady(true)
    }

    void boot()
  }, [])

  const login = async ({ email, password }: { email: string; password: string }) => {
    const response = await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    const mapped = mapAuthResponse(response)
    setAccessToken(mapped.accessToken)
    setRefreshToken(mapped.refreshToken)
    setUser(mapped.user)
    setActiveOrganizationId(mapped.activeOrganizationId)
  }

  const register = async ({ email, password, fullName }: { email: string; password: string; fullName: string }) => {
    const response = await apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { email, password, full_name: fullName },
    })
    const mapped = mapAuthResponse(response)
    setAccessToken(mapped.accessToken)
    setRefreshToken(mapped.refreshToken)
    setUser(mapped.user)
    setActiveOrganizationId(mapped.activeOrganizationId)
  }

  const logout = () => {
    removeCookie(ACCESS_TOKEN_KEY)
    removeCookie(REFRESH_TOKEN_KEY)
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(ACTIVE_ORG_KEY)
    setAccessToken(null)
    setRefreshToken(null)
    setUser(null)
    setActiveOrganizationId(null)
  }

  const selectOrganization = (organizationId: string) => {
    localStorage.setItem(ACTIVE_ORG_KEY, organizationId)
    setActiveOrganizationId(organizationId)
  }

  const activeRole = useMemo(() => {
    if (!user || !activeOrganizationId) return null
    return user.memberships.find((item) => item.organization_id == activeOrganizationId)?.role ?? null
  }, [user, activeOrganizationId])

  return (
    <AuthContext.Provider
      value={{
        isReady,
        isAuthenticated: Boolean(accessToken && user),
        accessToken,
        refreshToken,
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
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}

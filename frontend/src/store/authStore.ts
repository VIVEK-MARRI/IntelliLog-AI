/**
 * Authentication Store (Zustand)
 *
 * Session lifecycle:
 *   1. restoreSession() is called on app mount (see main.tsx).
 *   2. In dev-bypass mode (VITE_DEV_AUTH_BYPASS=true), restoreSession logs a
 *      loud console.warn and auto-populates auth with the dev tenant.
 *      This is intentionally visible — not silently indistinguishable from a
 *      real session.
 *   3. In production / non-bypass mode, restoreSession reads the token from
 *      localStorage and sets auth if a valid token is found. The UI redirects
 *      to /login if auth is null.
 */

import { create } from 'zustand'
import { AuthContext, AuthenticatedTenant } from '@/types/api'
import { apiClient } from '@/api/client'
import { fleetStore } from './fleetStore'
import { wsManager } from '@/api/websocket'

/** True when running in local dev with explicit bypass enabled. */
const DEV_BYPASS =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true'

const DEV_AUTH: AuthContext = {
  token: 'dev-token',
  tenant: { tenant_id: 'dev-tenant-id', name: 'Dev User', is_active: true },
}

interface AuthStore {
  auth: AuthContext | null
  isLoading: boolean
  isHydrating: boolean
  error: string | null

  // Actions
  setAuth: (auth: AuthContext) => void
  clearAuth: () => void
  setError: (error: string | null) => void
  setLoading: (loading: boolean) => void
  setHydrating: (hydrating: boolean) => void
  handleUnauthorized: () => void
  initializeStorageListener: () => (() => void) | void

  // Async actions
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  // Start with auth=null — ProtectedRoute will redirect to /login if restoreSession
  // doesn't populate it. DEV_BYPASS will populate it synchronously in restoreSession.
  auth: null,
  isLoading: false,
  isHydrating: true,
  error: null,

  setAuth: (auth) => {
    set({ auth, error: null })
    localStorage.setItem('auth_token', auth.token)
    apiClient.setToken(auth.token)
  },

  clearAuth: () => {
    set({ auth: null })
    localStorage.removeItem('auth_token')
    apiClient.clearToken()
  },

  handleUnauthorized: () => {
    set({ auth: null, error: 'Session expired. Please log in again.' })
    localStorage.removeItem('auth_token')
    apiClient.clearToken()
    wsManager.disconnect()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: 'Session expired. Please log in again.' }))
    }
  },

  setError: (error) => set({ error }),
  setLoading: (loading) => set({ isLoading: loading }),
  setHydrating: (hydrating) => set({ isHydrating: hydrating }),

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<{ access_token: string; tenant: AuthenticatedTenant }>(
        '/auth/login',
        { email, password }
      )

      const auth: AuthContext = {
        token: response.access_token,
        tenant: response.tenant,
      }

      set({ auth, isLoading: false })
      localStorage.setItem('auth_token', response.access_token)
      apiClient.setToken(response.access_token)
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Login failed',
        isLoading: false,
      })
      throw error
    }
  },

  logout: () => {
    set({ auth: null })
    localStorage.removeItem('auth_token')
    apiClient.clearToken()
    fleetStore.getState().clearOrders()
    wsManager.disconnect()
  },

  // Multi-tab sync: listen for storage changes in other tabs
  initializeStorageListener: () => {
    if (typeof window === 'undefined') return

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'auth_token' && event.newValue === null) {
        const { clearAuth } = useAuthStore.getState()
        clearAuth()
        wsManager.disconnect()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  },

  restoreSession: async () => {
    set({ isHydrating: true })

    // --- Dev bypass: explicit, loud, not silently-indistinguishable from real auth ---
    if (DEV_BYPASS) {
      console.warn(
        '[IntelliLog DEV] Auth bypass active (VITE_DEV_AUTH_BYPASS=true). ' +
        'Using synthetic dev-tenant-id session. Set VITE_DEV_AUTH_BYPASS=false to require login.'
      )
      apiClient.setToken(DEV_AUTH.token)
      set({ auth: DEV_AUTH, isHydrating: false })
      return
    }

    // --- Normal mode: restore from localStorage ---
    const storedToken = localStorage.getItem('auth_token')
    if (storedToken) {
      // Trust stored token (the API will 401 on any real request if it's expired)
      apiClient.setToken(storedToken)
      set({
        auth: {
          token: storedToken,
          // Tenant info isn't stored separately — the next API call will surface any issue
          tenant: { tenant_id: 'restored', name: 'Restored Session', is_active: true },
        },
        isHydrating: false,
      })
    } else {
      // No token → stay null, ProtectedRoute will redirect to /login
      set({ isHydrating: false })
    }
  },
}))

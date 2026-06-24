/**
 * Authentication Store (Zustand)
 */

import { create } from 'zustand'
import { AuthContext, AuthenticatedTenant } from '@/types/api'
import { apiClient } from '@/api/client'
import { fleetStore } from './fleetStore'
import { wsManager } from '@/api/websocket'

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
  auth: {
    token: 'dev-token',
    tenant: { tenant_id: 'dev-tenant-id', name: 'Dev User', is_active: true },
  },
  isLoading: false,
  isHydrating: false,
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
    // Dispatch event for toast notification
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
        // Token was removed in another tab - logout this tab
        const { clearAuth } = useAuthStore.getState()
        clearAuth()
        wsManager.disconnect()
        // Redirect to login if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  },

  restoreSession: async () => {
    // Dev mode - no session check needed
    set({ isHydrating: false })
  },
}))

// Initialize API client with dev token
apiClient.setToken('dev-token')

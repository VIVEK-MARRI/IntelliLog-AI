/**
 * Authentication Store (Zustand)
 */

import { create } from 'zustand'
import { AuthContext, AuthenticatedTenant } from '@/types/api'
import { apiClient } from '@/api/client'
import { fleetStore } from './fleetStore'

interface AuthStore {
  auth: AuthContext | null
  isLoading: boolean
  error: string | null

  // Actions
  setAuth: (auth: AuthContext) => void
  clearAuth: () => void
  setError: (error: string | null) => void
  setLoading: (loading: boolean) => void

  // Async actions
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  auth: null,
  isLoading: false,
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

  setError: (error) => set({ error }),
  setLoading: (loading) => set({ isLoading: loading }),

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
  },

  restoreSession: async () => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      set({ isLoading: true })
      try {
        apiClient.setToken(token)
        const tenant = await apiClient.get<AuthenticatedTenant>('/auth/me')
        set({
          auth: { token, tenant },
          isLoading: false,
        })
      } catch (error) {
        localStorage.removeItem('auth_token')
        set({ isLoading: false })
      }
    }
  },
}))

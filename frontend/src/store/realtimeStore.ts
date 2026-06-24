import { create } from 'zustand'

export type ConnectionQuality = 'good' | 'degraded' | 'poor'

export interface TickerEvent {
  id: string
  timestamp: string
  type: 'risk_change' | 'decision' | 'alert' | 'intervention' | 'route_opt' | 'eta' | 'system'
  severity: 'info' | 'warning' | 'critical' | 'success'
  title: string
  detail: string
}

export interface LiveNotification {
  id: string
  type: 'intervention' | 'route_optimized' | 'alert' | 'risk_change'
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical' | 'success'
  timestamp: string
  orderId?: string
  read: boolean
}

const MAX_TICKER_EVENTS = 100
const MAX_NOTIFICATIONS = 20

interface RealtimeStore {
  connectionQuality: ConnectionQuality
  rttMs: number
  tickerEvents: TickerEvent[]
  notifications: LiveNotification[]
  unreadCount: number

  setConnectionQuality: (quality: ConnectionQuality, rttMs: number) => void
  pushTickerEvent: (event: TickerEvent) => void
  pushNotification: (notification: LiveNotification) => void
  markAllRead: () => void
  dismissNotification: (id: string) => void
  clearNotifications: () => void
}

export const useRealtimeStore = create<RealtimeStore>((set) => ({
  connectionQuality: 'poor',
  rttMs: 0,
  tickerEvents: [],
  notifications: [],
  unreadCount: 0,

  setConnectionQuality: (quality, rttMs) =>
    set({ connectionQuality: quality, rttMs }),

  pushTickerEvent: (event) =>
    set((state) => ({
      tickerEvents: [event, ...state.tickerEvents].slice(0, MAX_TICKER_EVENTS),
    })),

  pushNotification: (notification) =>
    set((state) => {
      const notifications = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS)
      return { notifications, unreadCount: state.unreadCount + 1 }
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find((n) => n.id === id && !n.read) ? 1 : 0)),
    })),

  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
}))

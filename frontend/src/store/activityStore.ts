import { create } from 'zustand'

export type EventSeverity = 'info' | 'warning' | 'critical' | 'success'

export type ActivityEventType =
  | 'order_created'
  | 'prediction_updated'
  | 'agent_decision'
  | 'route_updated'
  | 'eta_updated'
  | 'alert'

export interface ActivityEvent {
  id: string
  timestamp: string
  type: ActivityEventType
  severity: EventSeverity
  title: string
  description: string
  orderId?: string
  metadata?: Record<string, any>
}

const MAX_EVENTS = 100

interface ActivityStore {
  events: ActivityEvent[]
  addEvent: (event: ActivityEvent) => void
  clearEvents: () => void
}

export const useActivityStore = create<ActivityStore>((set) => ({
  events: [],

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, MAX_EVENTS),
    })),

  clearEvents: () => set({ events: [] }),
}))

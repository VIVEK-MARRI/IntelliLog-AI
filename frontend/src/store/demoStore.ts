/**
 * Demo Mode Store — Deterministic scenario playback engine.
 * Seeds fleetStore with realistic data and replays timeline events
 * that trigger the realtime event bridge, ticker, and toasts.
 */

import { create } from 'zustand'
import { fleetStore } from './fleetStore'
import { useRealtimeStore } from './realtimeStore'
import { SCENARIOS, materializeOrder, materializeDecision, materializeWaypoints } from '@/data/demoScenarios'
import type { ScenarioType, ScenarioDefinition, DemoEventDef } from '@/data/demoScenarios'
import type { LiveOrder } from '@/types/api'

// ─── Types ────────────────────────────────────────────────────────────────

export type DemoSpeed = 1 | 2 | 5 | 10

export interface DemoState {
  isActive: boolean
  scenario: ScenarioType | null
  definition: ScenarioDefinition | null
  speed: DemoSpeed
  currentTick: number
  totalTicks: number
  elapsedMs: number
  startedAt: number | null
  liveOrders: LiveOrder[]
  processedEventIds: Set<string>
  tickInterval: ReturnType<typeof setInterval> | null
}

export interface DemoActions {
  startScenario: (type: ScenarioType) => void
  stop: () => void
  pause: () => void
  resume: () => void
  setSpeed: (speed: DemoSpeed) => void
  advanceTick: () => void
  processEvent: (event: DemoEventDef, orders: LiveOrder[]) => void
  reset: () => void
}

type DemoStore = DemoState & DemoActions

const initialState: DemoState = {
  isActive: false,
  scenario: null,
  definition: null,
  speed: 2,
  currentTick: 0,
  totalTicks: 0,
  elapsedMs: 0,
  startedAt: null,
  liveOrders: [],
  processedEventIds: new Set(),
  tickInterval: null,
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useDemoStore = create<DemoStore>((set, get) => ({
  ...initialState,

  startScenario: (type: ScenarioType) => {
    const state = get()
    // Stop any existing scenario
    if (state.tickInterval) {
      clearInterval(state.tickInterval)
    }

    const definition = SCENARIOS[type]
    if (!definition) return

    // Materialize all orders
    const orders = definition.orders.map(o => materializeOrder(o, type))

    // Seed fleetStore with initial orders
    fleetStore.getState().clearOrders()
    fleetStore.getState().setOrders(orders)
    fleetStore.getState().setConnectionStatus('connected')

    const totalTicks = Math.max(...definition.events.map(e => e.tick))

    set({
      isActive: true,
      scenario: type,
      definition,
      speed: 2,
      currentTick: 0,
      totalTicks,
      elapsedMs: 0,
      startedAt: Date.now(),
      liveOrders: orders,
      processedEventIds: new Set(),
      tickInterval: null,
    })

    // Start tick loop
    const startTickLoop = () => {
      const intervalId = setInterval(() => {
        const s = get()
        if (!s.isActive) {
          clearInterval(intervalId)
          return
        }

        // Advance tick
        const nextTick = s.currentTick + 1
        if (nextTick > s.totalTicks) {
          // Scenario complete — keep running but no more events
          set({ currentTick: s.totalTicks, elapsedMs: Date.now() - (s.startedAt || Date.now()) })
          return
        }

        // Process events at this tick
        const tickEvents = s.definition?.events.filter(e => e.tick === nextTick) || []
        const currentOrders = fleetStore.getState().orders
        const ordersArray = Array.from(currentOrders.values())

        for (const event of tickEvents) {
          get().processEvent(event, ordersArray)
        }

        set({
          currentTick: nextTick,
          elapsedMs: Date.now() - (s.startedAt || Date.now()),
          liveOrders: Array.from(fleetStore.getState().orders.values()),
        })
      }, getTickInterval(get().speed))

      set({ tickInterval: intervalId })
    }

    // Small delay so stores settle
    setTimeout(startTickLoop, 300)
  },

  stop: () => {
    const state = get()
    if (state.tickInterval) {
      clearInterval(state.tickInterval)
    }
    fleetStore.getState().clearOrders()
    fleetStore.getState().setConnectionStatus('disconnected')
    useRealtimeStore.getState().clearNotifications()
    set(initialState)
  },

  pause: () => {
    const state = get()
    if (state.tickInterval) {
      clearInterval(state.tickInterval)
    }
    set({ tickInterval: null })
  },

  resume: () => {
    const state = get()
    if (!state.isActive || state.tickInterval) return

    const intervalId = setInterval(() => {
      const s = get()
      if (!s.isActive) {
        clearInterval(intervalId)
        return
      }

      const nextTick = s.currentTick + 1
      if (nextTick > s.totalTicks) {
        set({ currentTick: s.totalTicks, elapsedMs: Date.now() - (s.startedAt || Date.now()) })
        return
      }

      const tickEvents = s.definition?.events.filter(e => e.tick === nextTick) || []
      const ordersArray = Array.from(fleetStore.getState().orders.values())

      for (const event of tickEvents) {
        get().processEvent(event, ordersArray)
      }

      set({
        currentTick: nextTick,
        elapsedMs: Date.now() - (s.startedAt || Date.now()),
        liveOrders: Array.from(fleetStore.getState().orders.values()),
      })
    }, getTickInterval(state.speed))

    set({ tickInterval: intervalId })
  },

  setSpeed: (speed: DemoSpeed) => {
    const state = get()
    set({ speed })

    // Restart tick loop with new speed if active and not paused
    if (state.isActive && state.tickInterval) {
      clearInterval(state.tickInterval)
      const intervalId = setInterval(() => {
        const s = get()
        if (!s.isActive) {
          clearInterval(intervalId)
          return
        }

        const nextTick = s.currentTick + 1
        if (nextTick > s.totalTicks) {
          set({ currentTick: s.totalTicks, elapsedMs: Date.now() - (s.startedAt || Date.now()) })
          return
        }

        const tickEvents = s.definition?.events.filter(e => e.tick === nextTick) || []
        const ordersArray = Array.from(fleetStore.getState().orders.values())

        for (const event of tickEvents) {
          get().processEvent(event, ordersArray)
        }

        set({
          currentTick: nextTick,
          elapsedMs: Date.now() - (s.startedAt || Date.now()),
          liveOrders: Array.from(fleetStore.getState().orders.values()),
        })
      }, getTickInterval(speed))
      set({ tickInterval: intervalId })
    }
  },

  advanceTick: () => {
    const state = get()
    if (!state.isActive || !state.definition) return

    const nextTick = state.currentTick + 1
    if (nextTick > state.totalTicks) return

    const tickEvents = state.definition.events.filter(e => e.tick === nextTick)
    const ordersArray = Array.from(fleetStore.getState().orders.values())

    for (const event of tickEvents) {
      state.processEvent(event, ordersArray)
    }

    set({
      currentTick: nextTick,
      elapsedMs: Date.now() - (state.startedAt || Date.now()),
      liveOrders: Array.from(fleetStore.getState().orders.values()),
    })
  },

  processEvent: (event: DemoEventDef, orders: LiveOrder[]) => {
    const state = get()
    const eventKey = `${event.tick}-${event.type}-${event.order_id}`
    if (state.processedEventIds.has(eventKey)) return

    // Track processed
    const updated = new Set(state.processedEventIds)
    updated.add(eventKey)
    set({ processedEventIds: updated })

    const store = fleetStore.getState()

    switch (event.type) {
      case 'risk_change': {
        const rs = event.data.risk_score as number
        if (event.order_id) {
          store.updateOrderRisk(event.order_id, rs)
          // Trigger ticker event via realtime store for visibility
          const order = orders.find(o => o.id === event.order_id)
          useRealtimeStore.getState().pushTickerEvent({
            id: `demo-risk-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: 'risk_change',
            severity: rs >= 0.7 ? 'critical' : rs >= 0.5 ? 'warning' : 'info',
            title: `Risk ${rs >= 0.7 ? 'surge' : 'change'} — ${event.order_id.slice(-8)}`,
            detail: `${order ? `${(order.risk_score * 100).toFixed(0)}% → ${(rs * 100).toFixed(0)}%` : (rs * 100).toFixed(0) + '%'}`,
          })
        }
        break
      }

      case 'decision': {
        const decision = materializeDecision(event, event.order_id)
        store.addAgentDecision(decision)
        // The useRealtimeEventBridge hook will pick this up and create ticker/notification
        break
      }

      case 'route_update': {
        if (event.order_id) {
          const order = orders.find(o => o.id === event.order_id)
          if (order) {
            const def = state.definition?.orders.find(o => o.id === event.order_id)
            if (def) {
              const waypoints = materializeWaypoints(def)
              store.updateRouteWaypoints(event.order_id, waypoints)
            }
          }
        }
        break
      }

      case 'alert': {
        const severity = event.data.severity as string || 'info'
        // Push to realtime ticker directly
        useRealtimeStore.getState().pushTickerEvent({
          id: `demo-alert-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'alert',
          severity: severity as 'critical' | 'warning' | 'success' | 'info',
          title: event.description,
          detail: (event.data.message as string) || '',
        })
        break
      }

      case 'eta_change': {
        if (event.order_id) {
          const eta = event.data.eta as string
          store.updateOrderETA(event.order_id, eta)
        }
        break
      }

      case 'system': {
        const message = event.data.message as string || event.description
        useRealtimeStore.getState().pushTickerEvent({
          id: `demo-sys-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'system',
          severity: 'info',
          title: message,
          detail: '',
        })
        break
      }
    }
  },

  reset: () => {
    const state = get()
    if (state.tickInterval) {
      clearInterval(state.tickInterval)
    }
    set(initialState)
  },
}))

// ─── Speed helpers ────────────────────────────────────────────────────────

function getTickInterval(speed: DemoSpeed): number {
  // At 1x: 1 tick per 2 seconds (so 12 ticks = 24 seconds)
  // At 2x: 1 tick per second
  // At 5x: 1 tick per 400ms
  // At 10x: 1 tick per 200ms
  switch (speed) {
    case 1: return 2000
    case 2: return 1000
    case 5: return 400
    case 10: return 200
  }
}

export const SPEED_OPTIONS: { value: DemoSpeed; label: string }[] = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 5, label: '5x' },
  { value: 10, label: '10x' },
]

export const DEMO_COLORS: Record<ScenarioType, string> = {
  normal: '#0EA5E9',
  incident: '#EF4444',
  peak_load: '#F59E0B',
  weather: '#6366F1',
  traffic: '#F97316',
  executive: '#06B6D4',
}

/**
 * Fleet Store (Zustand)
 * Central real-time state for all fleet data
 */

import { create } from 'zustand'
import { LiveOrder, AgentDecision, ConnectionStatus, Waypoint } from '@/types/api'

interface FleetStore {
  // Data
  orders: Map<string, LiveOrder>
  agentDecisions: AgentDecision[]
  selectedOrderId: string | null
  connectionStatus: ConnectionStatus

  // Actions
  setOrders: (orders: LiveOrder[]) => void
  updateOrderPosition: (orderId: string, update: any) => void
  batchUpdatePositions: (updates: Array<{orderId: string; lat: number; lng: number; speed_kmh: number; heading: number; risk_score: number; timestamp: string}>) => void
  updateOrderRisk: (orderId: string, riskScore: number, updatedAt?: string) => void
  updateOrderETA: (orderId: string, eta: string) => void
  updateRouteWaypoints: (orderId: string, waypoints: Waypoint[]) => void
  addAgentDecision: (decision: AgentDecision) => void
  setSelectedOrder: (orderId: string | null) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  clearOrders: () => void
  clearOldDecisions: (maxCount: number) => void
}

// Helper to calculate if order is high risk
const isHighRisk = (riskScore: number): boolean => riskScore > 0.7

// Pending position queue: buffers position updates for orders not yet in the store.
// Tradeoff: pending entries for orders that never arrive consume memory.
// Mitigation: queue is flushed on setOrders (initial_state, API load), and stale entries
// are limited to MAX_PENDING_ENTRIES. Any remaining entries after flush are orphaned
// only if an order_id is referenced in position updates but never delivered via API/WS.
const MAX_PENDING_ENTRIES = 500
const pendingPositionQueue = new Map<string, Array<{
  lat: number; lng: number; speed_kmh: number; heading: number;
  risk_score: number; timestamp: string;
}>>()

function enqueuePendingPosition(orderId: string, update: {
  lat: number; lng: number; speed_kmh: number; heading: number;
  risk_score: number; timestamp: string;
}): void {
  let updates = pendingPositionQueue.get(orderId)
  if (!updates) {
    if (pendingPositionQueue.size >= MAX_PENDING_ENTRIES) return
    updates = []
    pendingPositionQueue.set(orderId, updates)
  }
  updates.push(update)
}

function flushPendingForOrder(orderId: string): void {
  const updates = pendingPositionQueue.get(orderId)
  if (!updates || updates.length === 0) return
  pendingPositionQueue.delete(orderId)
  const latest = updates[updates.length - 1]
  // Apply via existing update path to avoid setOrders re-entrance
  fleetStore.getState().updateOrderPosition(orderId, latest)
}



export const fleetStore = create<FleetStore>((set) => ({
  orders: new Map(),
  agentDecisions: [],
  selectedOrderId: null,
  connectionStatus: 'disconnected',

  setOrders: (orders) => {
    set((state) => {
      const newOrders = new Map(state.orders)
      orders.forEach((order) => {
        newOrders.set(order.id, {
          ...order,
          is_high_risk: isHighRisk(order.risk_score),
        })
        flushPendingForOrder(order.id)
      })
      return { orders: newOrders }
    })
  },

  updateOrderPosition: (orderId, update) => {
    set((state) => {
      const orders = new Map(state.orders)
      const order = orders.get(orderId)

      if (!order) {
        enqueuePendingPosition(orderId, update)
        return { orders }
      }

      const updatedOrder: LiveOrder = {
        ...order,
        current_position: {
          lat: update.lat,
          lng: update.lng,
          speed_kmh: update.speed_kmh,
          heading: update.heading ?? 0,
          event_type: 'position_update',
          timestamp: update.timestamp,
        },
        risk_score: update.risk_score,
        is_high_risk: isHighRisk(update.risk_score),
        updated_at: update.timestamp,
      }
      orders.set(orderId, updatedOrder)
      return { orders }
    })
  },

  batchUpdatePositions: (updates: Array<{orderId: string; lat: number; lng: number; speed_kmh: number; heading: number; risk_score: number; timestamp: string}>) => {
    set((state) => {
      const orders = new Map(state.orders)
      for (const u of updates) {
        const order = orders.get(u.orderId)
        if (order) {
          orders.set(u.orderId, {
            ...order,
            current_position: {
              lat: u.lat,
              lng: u.lng,
              speed_kmh: u.speed_kmh,
              heading: u.heading ?? 0,
              event_type: 'position_update',
              timestamp: u.timestamp,
            },
            risk_score: u.risk_score,
            is_high_risk: isHighRisk(u.risk_score),
            updated_at: u.timestamp,
          })
        } else {
          enqueuePendingPosition(u.orderId, u)
        }
      }
      return { orders }
    })
  },

  updateOrderRisk: (orderId, riskScore, updatedAt = new Date().toISOString()) => {
    set((state) => {
      const orders = new Map(state.orders)
      const order = orders.get(orderId)

      if (order) {
        const updatedOrder: LiveOrder = {
          ...order,
          risk_score: riskScore,
          is_high_risk: isHighRisk(riskScore),
          updated_at: updatedAt,
        }
        orders.set(orderId, updatedOrder)
      }

      return { orders }
    })
  },

  updateOrderETA: (orderId, eta) => {
    set((state) => {
      const orders = new Map(state.orders)
      const order = orders.get(orderId)

      if (order) {
        const updatedOrder: LiveOrder = {
          ...order,
          current_eta: eta,
          updated_at: new Date().toISOString(),
        }
        orders.set(orderId, updatedOrder)
      }

      return { orders }
    })
  },

  updateRouteWaypoints: (orderId, waypoints) => {
    set((state) => {
      const orders = new Map(state.orders)
      const order = orders.get(orderId)

      if (order) {
        const updatedOrder: LiveOrder = {
          ...order,
          // Update stops from waypoints
          stops: waypoints
            .filter((w) => w.order_id === orderId || !w.order_id)
            .map((w, idx) => ({
              id: `stop-${idx}`,
              address: `Stop ${idx + 1}`,
              lat: w.lat,
              lng: w.lng,
              sequence: w.sequence,
              status: 'pending' as const,
              arrival_time: null,
            })),
          updated_at: new Date().toISOString(),
        }
        orders.set(orderId, updatedOrder)
      }

      return { orders }
    })
  },

  addAgentDecision: (decision) => {
    set((state) => {
      // Keep only last 50 decisions
      const decisions = [decision, ...state.agentDecisions].slice(0, 50)
      return { agentDecisions: decisions }
    })
  },

  clearOrders: () => {
    set({ orders: new Map(), agentDecisions: [], selectedOrderId: null })
  },

  setSelectedOrder: (orderId) => {
    set({ selectedOrderId: orderId })
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status })
  },

  clearOldDecisions: (maxCount) => {
    set((state) => ({
      agentDecisions: state.agentDecisions.slice(0, maxCount),
    }))
  },
}))

// Backward-compatible alias used across hooks/components
export const useFleetStore = fleetStore

// Helper to get orders as array (for use in components)
export const useOrdersArray = (): LiveOrder[] => {
  const orders = fleetStore((state) => state.orders)
  return Array.from(orders.values())
}

// Helper to get high-risk orders
export const useHighRiskOrders = (): LiveOrder[] => {
  const orders = fleetStore((state) => state.orders)
  return Array.from(orders.values()).filter((order) => order.is_high_risk)
}

// Helper to get agent decisions for specific order
export const useOrderDecisions = (orderId: string): AgentDecision[] => {
  const decisions = fleetStore((state) => state.agentDecisions)
  return decisions.filter((d) => d.order_id === orderId)
}

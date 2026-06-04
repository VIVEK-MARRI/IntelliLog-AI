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
      })
      return { orders: newOrders }
    })
  },

  updateOrderPosition: (orderId, update) => {
    set((state) => {
      const orders = new Map(state.orders)
      const order = orders.get(orderId)

      if (order) {
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

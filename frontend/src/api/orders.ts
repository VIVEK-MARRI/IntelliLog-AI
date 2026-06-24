/**
 * Orders API Endpoints
 */

import { apiClient } from './client'
import { Order, LiveOrder } from '@/types/api'

interface OrderListParams {
  page?: number
  page_size?: number
  status?: string
}

type BackendOrderResponse = {
  orderId?: string
  order_id?: string
  driverId?: string
  driver_id?: string
  status?: string
  plannedEta?: string
  planned_eta?: string
  currentEta?: string
  current_eta?: string
  currentRiskScore?: number
  current_risk_score?: number
  riskLevel?: string
  origin_lat?: number
  origin_lng?: number
  latitude?: number
  longitude?: number
  speed?: number
  stopsRemaining?: number
  stops_remaining?: number
  createdAt?: string
  created_at?: string
  updatedAt?: string
  updated_at?: string
}

/** Deterministic NYC-area coordinates from order ID hash. */
export function syntheticPosition(id: string): { lat: number; lng: number } {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  return {
    lat: 40.7128 + (Math.abs(hash % 1000) / 1000) * 0.15 - 0.075,
    lng: -74.006 + (Math.abs((hash >> 10) % 1000) / 1000) * 0.15 - 0.075,
  }
}

/** Extract valid position from any backend field, falling back to synthetic. */
function extractPosition(order: BackendOrderResponse): { lat: number; lng: number; speed_kmh: number } {
  const speedKmh = order.speed ?? 0
  const candidates: Array<[number | undefined, number | undefined]> = [
    [order.origin_lat, order.origin_lng],
    [order.latitude, order.longitude],
  ]
  for (const [lat, lng] of candidates) {
    const nlat = Number(lat)
    const nlng = Number(lng)
    if (!isNaN(nlat) && !isNaN(nlng) && (nlat !== 0 || nlng !== 0)) {
      return { lat: nlat, lng: nlng, speed_kmh: speedKmh }
    }
  }
  const syn = syntheticPosition(order.orderId ?? order.order_id ?? '')
  return { ...syn, speed_kmh: speedKmh }
}

const mapBackendOrder = (order: BackendOrderResponse): LiveOrder => {
  const riskScore = order.currentRiskScore ?? order.current_risk_score ?? 0
  const originLat = order.origin_lat ?? order.latitude ?? 0
  const originLng = order.origin_lng ?? order.longitude ?? 0
  const plannedEta = order.plannedEta ?? order.planned_eta ?? new Date().toISOString()
  const currentEta = order.currentEta ?? order.current_eta ?? plannedEta
  const createdAt = order.createdAt ?? order.created_at ?? new Date().toISOString()
  const updatedAt = order.updatedAt ?? order.updated_at ?? createdAt
  const backendStatus = order.status as string
  const pos = extractPosition(order)

  return {
    id: order.orderId ?? order.order_id ?? '',
    driver_id: order.driverId ?? order.driver_id ?? 'unknown',
    status: backendStatus === 'completed' ? 'completed' : 'active' as LiveOrder['status'],
    planned_eta: plannedEta,
    current_eta: currentEta,
    origin_lat: originLat,
    origin_lng: originLng,
    destination_lat: 0,
    destination_lng: 0,
    stops: [],
    current_position: {
      lat: pos.lat,
      lng: pos.lng,
      speed_kmh: pos.speed_kmh,
      heading: 0,
      event_type: 'gps_ping',
      timestamp: new Date().toISOString(),
    },
    distance_remaining_km: 0,
    time_remaining_minutes: 0,
    created_at: createdAt,
    updated_at: updatedAt,
    risk_score: riskScore,
    is_high_risk: riskScore > 0.7,
    delay_minutes: 0,
    route_efficiency: 0,
  }
}

export const ordersAPI = {
  /**
   * Get paginated list of orders
   */
  async getOrders(params: OrderListParams = {}): Promise<{ items: LiveOrder[]; total: number }> {
    const response = await apiClient.get<{ items: BackendOrderResponse[]; total?: number; total_count?: number; totalCount?: number }>('/orders', { params: params as Record<string, string | number> })
    return {
      items: response.items.map((o) => mapBackendOrder(o)),
      total: response.totalCount ?? response.total ?? response.total_count ?? response.items.length,
    }
  },

  /**
   * Get single order by ID
   */
  async getOrder(orderId: string): Promise<LiveOrder> {
    const response = await apiClient.get<BackendOrderResponse>(`/orders/${orderId}`)
    return mapBackendOrder(response)
  },

  /**
   * Create new order
   */
  async createOrder(data: {
    driver_id: string
    origin_lat: number
    origin_lng: number
    destination_lat: number
    destination_lng: number
    planned_eta: string
  }): Promise<Order> {
    return apiClient.post<Order>('/orders', data)
  },

  /**
   * Update order position (high-frequency endpoint)
   * Targets <20ms latency
   */
  async updatePosition(
    orderId: string,
    data: {
      lat: number
      lng: number
      speed_kmh: number
      heading: number
      event_type: string
    }
  ): Promise<{ current_risk_score: number; updated_at: string }> {
    return apiClient.patch<{ current_risk_score: number; updated_at: string }>(
      `/orders/${orderId}/position`,
      data
    )
  },

  /**
   * Get order's current route
   */
  async getCurrentRoute(orderId: string): Promise<any> {
    return apiClient.get(`/orders/${orderId}/route`)
  },

  /**
   * Get active orders for a driver
   */
  async getDriverActiveOrders(driverId: string): Promise<LiveOrder[]> {
    return apiClient.get<LiveOrder[]>('/orders', {
      params: { driver_id: driverId, status: 'active' },
    })
  },

  /**
   * Get orders by status
   */
  async getOrdersByStatus(status: string): Promise<LiveOrder[]> {
    return apiClient.get<LiveOrder[]>('/orders', { params: { status } })
  },

  /**
   * Bulk get orders by IDs — dispatched as parallel single-order fetches.
   */
  async getBulkOrders(orderIds: string[]): Promise<LiveOrder[]> {
    const results = await Promise.allSettled(orderIds.map((id) => this.getOrder(id)))
    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<LiveOrder>).value)
  },
}

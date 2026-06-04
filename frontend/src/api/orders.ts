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

const mapBackendOrder = (order: BackendOrderResponse): LiveOrder => {
  const riskScore = order.currentRiskScore ?? order.current_risk_score ?? 0
  const latitude = order.latitude ?? 0
  const longitude = order.longitude ?? 0
  const plannedEta = order.plannedEta ?? order.planned_eta ?? new Date().toISOString()
  const currentEta = order.currentEta ?? order.current_eta ?? plannedEta
  const createdAt = order.createdAt ?? order.created_at ?? new Date().toISOString()
  const updatedAt = order.updatedAt ?? order.updated_at ?? createdAt

  return {
    id: order.orderId ?? order.order_id ?? '',
    driver_id: order.driverId ?? order.driver_id ?? 'unknown',
    status: (order.status as LiveOrder['status']) ?? 'pending',
    planned_eta: plannedEta,
    current_eta: currentEta,
    origin_lat: latitude,
    origin_lng: longitude,
    destination_lat: latitude,
    destination_lng: longitude,
    stops: [
      {
        id: 'stop-1',
        address: 'Live Stop',
        lat: latitude,
        lng: longitude,
        sequence: 1,
        status: 'pending',
        arrival_time: null,
      },
    ],
    current_position: {
      lat: latitude,
      lng: longitude,
      speed_kmh: order.speed ?? 0,
      heading: 0,
      event_type: 'dashboard_sync',
      timestamp: updatedAt,
    },
    distance_remaining_km: 0,
    time_remaining_minutes: 0,
    created_at: createdAt,
    updated_at: updatedAt,
    risk_score: riskScore,
    is_high_risk: riskScore > 0.7,
    delay_minutes: 0,
    route_efficiency: 100,
  }
}

export const ordersAPI = {
  /**
   * Get paginated list of orders
   */
  async getOrders(params: OrderListParams = {}): Promise<{ items: LiveOrder[]; total: number }> {
    const response = await apiClient.get<{ items: BackendOrderResponse[]; total?: number; total_count?: number }>('/orders', { params: params as Record<string, string | number> })
    return {
      items: response.items.map((o) => mapBackendOrder(o)),
      total: response.total ?? response.total_count ?? response.items.length,
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
   * Bulk get orders by IDs
   */
  async getBulkOrders(orderIds: string[]): Promise<LiveOrder[]> {
    const query = orderIds.map(id => `ids=${id}`).join('&')
    return apiClient.get<LiveOrder[]>(`/orders/bulk?${query}`)
  },
}

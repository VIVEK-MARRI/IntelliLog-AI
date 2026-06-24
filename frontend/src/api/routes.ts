import { apiClient } from './client'

export interface Waypoint {
  stop_id: string
  latitude: number
  longitude: number
  sequence: number
  service_duration_minutes: number
  address?: string
  customer_name?: string
}

export interface RouteResponse {
  order_id: string
  waypoints: Waypoint[]
  total_distance_km: number
  total_duration_minutes: number
  current_waypoint_sequence: number
  route_optimized_at: string
  solver_status: string
}

export interface OptimizeRouteResponse {
  job_id: string
  status: string
  poll_url: string
}

export interface JobStatusResponse {
  job_id: string
  order_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  submitted_at: string
  started_at?: string
  completed_at?: string
  result?: RouteResponse
  error?: string
  duration_ms?: number
}

export interface RouteHistoryEntry {
  route_plan_id: string
  order_id: string
  created_at: string
  waypoints: any
  total_distance_km: number
  total_duration_minutes: number
  solver_status: string
  solver_duration_ms: number
}

export const routesAPI = {
  async optimizeRoute(orderId: string, forceReroute = false): Promise<OptimizeRouteResponse> {
    return apiClient.post<OptimizeRouteResponse>('/routes/optimize', {
      order_id: orderId,
      force_reroute: forceReroute,
    })
  },

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    return apiClient.get<JobStatusResponse>(`/routes/jobs/${jobId}`)
  },

  async getCurrentRoute(orderId: string): Promise<RouteResponse> {
    return apiClient.get<RouteResponse>(`/routes/${orderId}/current`)
  },

  async getRouteHistory(orderId: string): Promise<RouteHistoryEntry[]> {
    return apiClient.get<RouteHistoryEntry[]>(`/routes/${orderId}/history`)
  },
}

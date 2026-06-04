/**
 * Core API Types for IntelliLog-AI
 */

// ============================================================================
// Authentication & Tenant
// ============================================================================

export interface AuthenticatedTenant {
  tenant_id: string
  name: string
  is_active: boolean
}

export interface AuthContext {
  token: string
  tenant: AuthenticatedTenant
}

// ============================================================================
// Orders
// ============================================================================

export interface PositionUpdate {
  lat: number
  lng: number
  speed_kmh: number
  heading: number
  event_type: string
  timestamp: string
}

export interface Order {
  id: string
  driver_id: string
  status:
    | 'pending'
    | 'confirmed'
    | 'assigned'
    | 'active'
    | 'in_progress'
    | 'in_transit'
    | 'completed'
    | 'delivered'
    | 'failed'
    | 'cancelled'
  planned_eta: string
  current_eta: string
  origin_lat: number
  origin_lng: number
  destination_lat: number
  destination_lng: number
  origin_address?: string
  destination_address?: string
  customer_name?: string
  driver_name?: string
  estimated_distance_km?: number
  estimated_duration_minutes?: number
  current_stop?: number
  stops: Stop[]
  current_position: PositionUpdate | null
  distance_remaining_km: number
  time_remaining_minutes: number
  created_at: string
  updated_at: string
}

export interface Stop {
  id: string
  address: string
  lat: number
  lng: number
  sequence: number
  status: 'pending' | 'completed'
  arrival_time: string | null
}

export interface LiveOrder extends Order {
  risk_score: number
  is_high_risk: boolean
  delay_minutes: number
  route_efficiency: number
  origin?: string
  destination?: string
  eta_time?: string
}

// ============================================================================
// Predictions & ML
// ============================================================================

export interface RiskFactor {
  feature: string
  contribution: number
  direction: 'increases' | 'decreases'
  humanReadable: string
  value: string | number
}

export interface PredictionResponse {
  order_id: string
  risk_score: number
  isHighRisk: boolean
  confidence: number
  topRiskFactors: RiskFactor[]
  predicted_delay_minutes: number
  model_version: string
  cached: boolean
  latency_ms: number
}

// ============================================================================
// Routes & Optimization
// ============================================================================

export interface Waypoint {
  lat: number
  lng: number
  order_id: string | null
  sequence: number
  type: 'pickup' | 'delivery' | 'depot'
}

export interface RouteResponse {
  route_id: string
  driver_id: string
  waypoints: Waypoint[]
  distance_km: number
  estimated_time_minutes: number
  stops_count: number
  optimized_at: string
}

export interface JobStatusResponse {
  job_id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  progress: number
  result?: RouteResponse
  error?: string
  created_at: string
  completed_at?: string
}

// ============================================================================
// Agent Decisions
// ============================================================================

export interface AgentDecision {
  id: string
  order_id: string
  decision_type: 'no_action' | 'alert' | 'reroute'
  reasoning: string
  risk_score: number
  tools_invoked: string[]
  outcome: 'success' | 'pending' | 'failed'
  created_at: string
  latency_ms: number
  impact?: {
    time_saved_minutes?: number
    risk_reduction?: number
  }
}

// ============================================================================
// Fleet & Drivers
// ============================================================================

export interface Driver {
  id: string
  name: string
  status: 'available' | 'on_duty' | 'off_duty'
  current_lat?: number
  current_lng?: number
  active_order_count: number
  completed_orders_today: number
  on_time_percentage: number
}

// ============================================================================
// WebSocket Messages
// ============================================================================

export type WebSocketMessageType =
  | 'order_position_updated'
  | 'prediction_updated'
  | 'agent_decision'
  | 'route_updated'
  | 'eta_updated'
  | 'pong'
  | 'error'

export interface WebSocketMessage {
  type: WebSocketMessageType
  data: Record<string, any>
  timestamp: string
}

export interface OrderPositionUpdate {
  type: 'order_position_updated'
  order_id: string
  lat: number
  lng: number
  speed: number
  risk_score: number
  timestamp: string
}

export interface AgentDecisionMessage {
  type: 'agent_decision'
  order_id: string
  decision: 'no_action' | 'alert' | 'reroute'
  risk_score: number
  reasoning: string
  latency_ms: number
}

export interface RouteUpdatedMessage {
  type: 'route_updated'
  order_id: string
  new_waypoints: Waypoint[]
  time_saved_minutes: number
}

export interface ETAUpdatedMessage {
  type: 'eta_updated'
  order_id: string
  new_eta: string
  reason: string
}

// ============================================================================
// Operational Intelligence
// ============================================================================

export interface OperationalMetrics {
  orders_processed: number
  active_deliveries: number
  high_risk_deliveries: number
  average_delay_minutes: number
  agent_interventions: number
  on_time_percentage: number
}

export interface DelayCause {
  cause: string
  percentage: number
  affected_orders: number
  trend: 'up' | 'down' | 'stable'
}

export interface Recommendation {
  id: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  confidence: number
  estimated_impact_percentage: number
  action: string
  created_at: string
}

export interface FleetHealth {
  score: number
  status: 'excellent' | 'healthy' | 'warning' | 'critical'
  on_time_rate: number
  delay_frequency: number
  risk_distribution: number
  route_efficiency: number
  intervention_frequency: number
  trend: number // percentage change vs previous day
}

// ============================================================================
// Dashboard State
// ============================================================================

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface DashboardState {
  connectionStatus: ConnectionStatus
  isLoading: boolean
  error?: string
}

export type OperationsMode = 'operations' | 'executive'

// ============================================================================
// UI State
// ============================================================================

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  duration?: number
}

export interface SelectedOrder {
  orderId: string
  timestamp: number
}

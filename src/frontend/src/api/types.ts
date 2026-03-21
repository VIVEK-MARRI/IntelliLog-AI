export type ServiceState = 'healthy' | 'degraded' | 'unhealthy';

export interface ApiErrorPayload {
  detail?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface DriverTracking {
  id?: string;
  driver_id?: string;
  name?: string;
  driver_name?: string;
  status?: string;
  vehicle_type?: 'bike' | 'auto' | 'car' | string;
  current_lat?: number;
  current_lng?: number;
  lat?: number;
  lng?: number;
  heading_degrees?: number;
  speed_kmh?: number;
  progress_pct?: number;
  stops_left?: number;
  next_eta_min?: number;
  current_zone?: string;
}

export interface NearbyDriversResponse {
  drivers?: DriverTracking[];
  items?: DriverTracking[];
  data?: DriverTracking[];
}

export interface OrderRecord {
  id: string;
  order_number?: string;
  driver_id?: string;
  delivery_address?: string;
  lat: number;
  lng: number;
  status?: string;
  predicted_eta_min?: number;
  confidence_within_5min?: number;
  created_at?: string;
}

export interface RouteRecord {
  id: string;
  driver_id?: string;
  status?: string;
  total_distance_km?: number;
  total_duration_min?: number;
  geometry_json?: {
    points?: Array<{ lat: number; lng: number }>;
  };
  geometry?: Array<{ lat: number; lng: number }>;
  path?: Array<{ lat: number; lng: number }>;
}

export interface ETAExplanationFactor {
  feature: string;
  impact_minutes: number;
  sentence?: string;
  importance_rank?: number;
}

export interface ETAExplanation {
  order_id?: string;
  eta_minutes?: number;
  eta_p10?: number;
  eta_p90?: number;
  confidence_within_5min?: number;
  summary?: string;
  factors?: ETAExplanationFactor[];
  what_would_help?: string;
}

export interface SystemStatus {
  status?: string;
  timestamp?: string;
  rerouting_enabled?: boolean;
  reroute_interval_sec?: number;
  osrm_enabled?: boolean;
  version?: string;
  api?: ServiceState;
  redis?: ServiceState;
  celery?: ServiceState;
  db?: ServiceState;
  workers?: number;
}

export interface LogisticsMetrics {
  timestamp: string;
  driver_utilization_pct?: number;
  delivery_success_rate_pct?: number;
  route_efficiency?: {
    avg_distance_per_order_km?: number;
    total_routes?: number;
    total_distance_km?: number;
  };
  eta_prediction?: {
    mae_minutes?: number | string;
    samples?: number;
  };
  orders?: {
    total?: number;
    delivered?: number;
    failed?: number;
    pending?: number;
  };
  fleet?: {
    total_drivers?: number;
    active_drivers?: number;
  };
  warehouses?: Array<{
    id: string;
    name: string;
    total_orders: number;
    pending_orders: number;
    total_drivers: number;
  }>;
}

export type DispatchSocketMessage =
  | {
      type: 'position_update';
      driver_id: string;
      lat: number;
      lng: number;
      speed_kmh?: number;
      heading_degrees?: number;
      progress_pct?: number;
      stops_left?: number;
      next_eta_min?: number;
      current_zone?: string;
    }
  | {
      type: 'deviation_alert';
      driver_id: string;
      distance_m?: number;
      expected_lat?: number;
      expected_lng?: number;
      actual_lat?: number;
      actual_lng?: number;
      message?: string;
    }
  | {
      type: 'eta_update';
      order_id: string;
      eta_min: number;
      confidence?: number;
    }
  | {
      type: 'delivery_completed';
      order_id: string;
      completed_at?: string;
    }
  | {
      type: 'reoptimize_triggered';
      message?: string;
    }
  | {
      type: 'connected' | 'ping' | 'pong';
      message?: string;
    };

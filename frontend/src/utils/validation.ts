import { z } from 'zod'

export const PositionUpdateSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  speed_kmh: z.number(),
  heading: z.number(),
  event_type: z.string(),
  timestamp: z.string(),
})

export const StopSchema = z.object({
  id: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  sequence: z.number(),
  status: z.enum(['pending', 'completed']),
  arrival_time: z.string().nullable(),
})

export const LiveOrderSchema = z.object({
  id: z.string(),
  driver_id: z.string(),
  status: z.enum(['pending', 'confirmed', 'assigned', 'active', 'in_progress', 'in_transit', 'completed', 'delivered', 'failed', 'cancelled']),
  planned_eta: z.string(),
  current_eta: z.string(),
  origin_lat: z.number(),
  origin_lng: z.number(),
  destination_lat: z.number(),
  destination_lng: z.number(),
  stops: z.array(StopSchema),
  current_position: PositionUpdateSchema.nullable(),
  distance_remaining_km: z.number(),
  time_remaining_minutes: z.number(),
  risk_score: z.number(),
  is_high_risk: z.boolean(),
  delay_minutes: z.number(),
  route_efficiency: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const OperationalMetricsSchema = z.object({
  orders_processed: z.number(),
  active_deliveries: z.number(),
  high_risk_deliveries: z.number(),
  average_delay_minutes: z.number(),
  agent_interventions: z.number(),
  on_time_percentage: z.number(),
})

export const FleetHealthSchema = z.object({
  score: z.number(),
  status: z.enum(['excellent', 'healthy', 'warning', 'critical']),
  on_time_rate: z.number(),
  delay_frequency: z.number(),
  risk_distribution: z.number(),
  route_efficiency: z.number(),
  intervention_frequency: z.number(),
  trend: z.number(),
})

export function validateLiveOrders(value: unknown) {
  const result = z.array(LiveOrderSchema).safeParse(value)
  if (!result.success) {
    console.error('[Validation] Invalid LiveOrder payload:', result.error.issues)
  }
  return result
}

export function validateOperationalMetrics(value: unknown) {
  const result = OperationalMetricsSchema.safeParse(value)
  if (!result.success) {
    console.error('[Validation] Invalid OperationalMetrics payload:', result.error.issues)
  }
  return result
}

export function validateFleetHealth(value: unknown) {
  const result = FleetHealthSchema.safeParse(value)
  if (!result.success) {
    console.error('[Validation] Invalid FleetHealth payload:', result.error.issues)
  }
  return result
}

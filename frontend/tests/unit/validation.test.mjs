// Unit tests for production-critical frontend utilities
// Runs with Node's built-in test runner — no extra deps
// Usage: node --test tests/unit/*.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'

// Mirror of src/utils/validation.ts — kept in sync intentionally
const PositionUpdateSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  speed_kmh: z.number(),
  heading: z.number(),
  event_type: z.string(),
  timestamp: z.string(),
})

const StopSchema = z.object({
  id: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  sequence: z.number(),
  status: z.enum(['pending', 'completed']),
  arrival_time: z.string().nullable(),
})

const LiveOrderSchema = z.object({
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

const OperationalMetricsSchema = z.object({
  orders_processed: z.number(),
  active_deliveries: z.number(),
  high_risk_deliveries: z.number(),
  average_delay_minutes: z.number(),
  agent_interventions: z.number(),
  on_time_percentage: z.number(),
})

const FleetHealthSchema = z.object({
  score: z.number(),
  status: z.enum(['excellent', 'healthy', 'warning', 'critical']),
  on_time_rate: z.number(),
  delay_frequency: z.number(),
  risk_distribution: z.number(),
  route_efficiency: z.number(),
  intervention_frequency: z.number(),
  trend: z.number(),
})

const validOrder = {
  id: 'ORD-0001',
  driver_id: 'DRV-01',
  status: 'active',
  planned_eta: '2026-06-04T12:00:00Z',
  current_eta: '2026-06-04T12:30:00Z',
  origin_lat: 40.0,
  origin_lng: -74.0,
  destination_lat: 41.0,
  destination_lng: -73.0,
  stops: [],
  current_position: null,
  distance_remaining_km: 12.5,
  time_remaining_minutes: 18,
  risk_score: 0.45,
  is_high_risk: false,
  delay_minutes: 2,
  route_efficiency: 92,
  created_at: '2026-06-04T08:00:00Z',
  updated_at: '2026-06-04T11:00:00Z',
}

test('LiveOrderSchema accepts a well-formed order', () => {
  const r = z.array(LiveOrderSchema).safeParse([validOrder])
  assert.equal(r.success, true)
})

test('LiveOrderSchema rejects missing id', () => {
  const { id, ...broken } = validOrder
  const r = z.array(LiveOrderSchema).safeParse([broken])
  assert.equal(r.success, false)
})

test('LiveOrderSchema rejects invalid status enum value', () => {
  const broken = { ...validOrder, status: 'invalid_status' }
  const r = z.array(LiveOrderSchema).safeParse([broken])
  assert.equal(r.success, false)
})

test('LiveOrderSchema rejects string for risk_score (number required)', () => {
  const broken = { ...validOrder, risk_score: '0.5' }
  const r = z.array(LiveOrderSchema).safeParse([broken])
  assert.equal(r.success, false)
})

test('LiveOrderSchema rejects null stops array', () => {
  const broken = { ...validOrder, stops: null }
  const r = z.array(LiveOrderSchema).safeParse([broken])
  assert.equal(r.success, false)
})

test('LiveOrderSchema accepts a fully populated position', () => {
  const populated = {
    ...validOrder,
    current_position: {
      lat: 40.5, lng: -73.5, speed_kmh: 65, heading: 90,
      event_type: 'position_update', timestamp: '2026-06-04T12:00:00Z',
    },
  }
  const r = z.array(LiveOrderSchema).safeParse([populated])
  assert.equal(r.success, true)
})

test('OperationalMetricsSchema accepts a valid payload', () => {
  const m = {
    orders_processed: 100, active_deliveries: 25, high_risk_deliveries: 4,
    average_delay_minutes: 3.2, agent_interventions: 8, on_time_percentage: 87,
  }
  const r = OperationalMetricsSchema.safeParse(m)
  assert.equal(r.success, true)
})

test('OperationalMetricsSchema rejects string for on_time_percentage', () => {
  const m = {
    orders_processed: 100, active_deliveries: 25, high_risk_deliveries: 4,
    average_delay_minutes: 3.2, agent_interventions: 8, on_time_percentage: '87',
  }
  const r = OperationalMetricsSchema.safeParse(m)
  assert.equal(r.success, false)
})

test('FleetHealthSchema accepts a valid payload', () => {
  const h = {
    score: 87, status: 'healthy', on_time_rate: 85, delay_frequency: 8,
    risk_distribution: 12, route_efficiency: 90, intervention_frequency: 15, trend: 2.5,
  }
  const r = FleetHealthSchema.safeParse(h)
  assert.equal(r.success, true)
})

test('FleetHealthSchema rejects invalid status', () => {
  const h = {
    score: 87, status: 'amazing', on_time_rate: 85, delay_frequency: 8,
    risk_distribution: 12, route_efficiency: 90, intervention_frequency: 15, trend: 2.5,
  }
  const r = FleetHealthSchema.safeParse(h)
  assert.equal(r.success, false)
})

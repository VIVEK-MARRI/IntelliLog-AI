/**
 * Deterministic Demo Scenarios for IntelliLog-AI Demo Mode.
 * Six pre-authored scenarios with zero randomness.
 * Each scenario defines initial orders + timeline events that replay
 * realistic fleet operations activity.
 */

import type { LiveOrder, AgentDecision, Waypoint } from '@/types/api'

// ─── Helpers ──────────────────────────────────────────────────────────────

function isHighRisk(score: number): boolean {
  return score > 0.7
}

// ─── Types ────────────────────────────────────────────────────────────────

export type ScenarioType =
  | 'normal'
  | 'incident'
  | 'peak_load'
  | 'weather'
  | 'traffic'
  | 'executive'

export interface ScenarioMeta {
  id: ScenarioType
  label: string
  description: string
  icon: string
  durationMinutes: number
  eventCount: number
}

export interface DemoOrderDef {
  id: string
  driver_id: string
  driver_name: string
  status: string
  risk_score: number
  delay_minutes: number
  route_efficiency: number
  lat: number
  lng: number
  dest_lat: number
  dest_lng: number
  stops: number
  distance_km: number
}

export interface DemoEventDef {
  tick: number
  type: 'risk_change' | 'decision' | 'route_update' | 'alert' | 'eta_change' | 'system'
  order_id: string
  data: Record<string, unknown>
  description: string
}

export interface ScenarioDefinition {
  meta: ScenarioMeta
  orders: DemoOrderDef[]
  events: DemoEventDef[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const DRIVERS = [
  'Sarah Chen', 'Marcus Johnson', 'Elena Rodriguez', 'James Wilson',
  'Priya Patel', 'David Kim', 'Lisa Thompson', 'Carlos Mendez',
  'Aisha Williams', 'Tom Brooks', 'Nina Kravitz', 'Omar Hassan',
]

const CUSTOMERS = [
  'Acme Corp', 'GlobalEx', 'MedSupply', 'FreshFoods', 'TechParts',
  'BuildRight', 'CleanWater', 'AutoZone', 'PharmaCare', 'GreenGrocer',
]

function eta(minutesFromNow: number): string {
  const d = new Date(Date.now() + minutesFromNow * 60000)
  return d.toISOString()
}

function makeOrder(
  i: number, scenario: string,
  overrides: Partial<DemoOrderDef>,
): DemoOrderDef {
  const idx = i.toString().padStart(3, '0')
  const driverIdx = (i - 1) % DRIVERS.length
  const baseLat = 40.7128 + (Math.sin(i * 7) * 0.08)
  const baseLng = -74.006 + (Math.cos(i * 11) * 0.08)
  return {
    id: `DEMO-${scenario}-${idx}`,
    driver_id: `DRV-${(100 + i).toString().padStart(3, '0')}`,
    driver_name: DRIVERS[driverIdx],
    status: 'active',
    risk_score: 0.15 + (Math.sin(i * 13) * 0.08 + 0.08),
    delay_minutes: 2 + (i * 3) % 25,
    route_efficiency: 65 + (i * 7) % 30,
    lat: baseLat,
    lng: baseLng,
    dest_lat: baseLat + 0.05 + (Math.sin(i * 5) * 0.02),
    dest_lng: baseLng + 0.04 + (Math.cos(i * 3) * 0.02),
    stops: 2 + (i % 6),
    distance_km: 5 + (i * 2) % 40,
    ...overrides,
  }
}

function buildStops(order: DemoOrderDef) {
  const stops = []
  for (let s = 0; s < order.stops; s++) {
    const lat = order.lat + (Math.sin(s * 31 + 17) * 0.015)
    const lng = order.lng + (Math.cos(s * 23 + 11) * 0.015)
    stops.push({
      id: `stop-${order.id}-${s}`,
      address: `${CUSTOMERS[(s + order.stops) % CUSTOMERS.length]} #${s + 1}`,
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      sequence: s,
      status: 'pending' as const,
      arrival_time: null,
    })
  }
  return stops
}

export function materializeOrder(def: DemoOrderDef, scenario: string): LiveOrder {
  return {
    id: def.id,
    driver_id: def.driver_id,
    driver_name: def.driver_name,
    status: def.status as LiveOrder['status'],
    planned_eta: eta(def.delay_minutes + 30),
    current_eta: eta(def.delay_minutes + 35),
    origin_lat: def.lat,
    origin_lng: def.lng,
    destination_lat: def.dest_lat,
    destination_lng: def.dest_lng,
    origin_address: `Depot ${scenario.toUpperCase()}`,
    destination_address: CUSTOMERS[(def.stops) % CUSTOMERS.length],
    customer_name: CUSTOMERS[(def.stops + 3) % CUSTOMERS.length],
    estimated_distance_km: def.distance_km,
    estimated_duration_minutes: def.delay_minutes + 25,
    current_stop: 1,
    stops: buildStops(def),
    current_position: {
      lat: def.lat + 0.01,
      lng: def.lng + 0.01,
      speed_kmh: 35 + (def.delay_minutes % 25),
      heading: 180 + (def.stops * 30),
      event_type: 'gps_ping',
      timestamp: new Date().toISOString(),
    },
    distance_remaining_km: Math.max(1, def.distance_km - (def.stops * 2)),
    time_remaining_minutes: def.delay_minutes + 15,
    created_at: eta(-120),
    updated_at: new Date().toISOString(),
    risk_score: def.risk_score,
    is_high_risk: isHighRisk(def.risk_score),
    delay_minutes: def.delay_minutes,
    route_efficiency: def.route_efficiency,
  }
}

export function materializeDecision(
  def: DemoEventDef,
  orderId: string,
): AgentDecision {
  const dt = def.data
  return {
    id: `demo-dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    order_id: orderId,
    decision_type: (dt.decision_type as AgentDecision['decision_type']) || 'no_action',
    reasoning: (dt.reasoning as string) || def.description,
    risk_score: (dt.risk_score as number) || 0.5,
    tools_invoked: (dt.tools as string[]) || [],
    outcome: (dt.outcome as AgentDecision['outcome']) || 'success',
    created_at: new Date().toISOString(),
    latency_ms: 150 + Math.floor(Math.random() * 850),
  }
}

export function materializeWaypoints(order: DemoOrderDef): Waypoint[] {
  const wp: Waypoint[] = []
  for (let s = 0; s < order.stops; s++) {
    const lat = order.lat + (Math.sin(s * 31 + 17) * 0.012)
    const lng = order.lng + (Math.cos(s * 23 + 11) * 0.012)
    wp.push({
      lat: Math.round(lat * 10000) / 10000,
      lng: Math.round(lng * 10000) / 10000,
      order_id: order.id,
      sequence: s,
      type: s === 0 ? 'pickup' : s === order.stops - 1 ? 'delivery' : 'delivery',
    })
  }
  return wp
}

// ─── SCENARIO 1: Normal Operations ────────────────────────────────────────

const NORMAL_ORDERS: DemoOrderDef[] = Array.from({ length: 15 }, (_, i) =>
  makeOrder(i + 1, 'normal', {
    risk_score: 0.1 + (i * 0.035),
    delay_minutes: 0 + (i * 2) % 12,
    route_efficiency: 78 + (i * 1.2) % 18,
    stops: 2 + (i % 4),
  }),
)

const NORMAL_EVENTS: DemoEventDef[] = [
  { tick: 1, type: 'system', order_id: '', data: { message: 'System health check passed — all services operational' }, description: 'System health check passed' },
  { tick: 2, type: 'risk_change', order_id: 'DEMO-normal-001', data: { risk_score: 0.15 }, description: 'ORD-001 risk updated to 0.15' },
  { tick: 3, type: 'eta_change', order_id: 'DEMO-normal-003', data: { eta: eta(25) }, description: 'ORD-003 ETA recalculated +2min' },
  { tick: 4, type: 'decision', order_id: 'DEMO-normal-005', data: { decision_type: 'no_action', reasoning: 'All metrics within normal parameters. No intervention required.', risk_score: 0.22, outcome: 'success', tools: ['RouteMonitor'] }, description: 'ORD-005 no action taken' },
  { tick: 5, type: 'risk_change', order_id: 'DEMO-normal-008', data: { risk_score: 0.28 }, description: 'ORD-008 risk slightly elevated to 0.28' },
  { tick: 6, type: 'route_update', order_id: 'DEMO-normal-002', data: { stops: 3 }, description: 'ORD-002 route optimized — 3 stops' },
  { tick: 7, type: 'system', order_id: '', data: { message: 'Fleet health: 94% — 1 degraded, 0 down' }, description: 'Fleet health snapshot: 94%' },
  { tick: 8, type: 'eta_change', order_id: 'DEMO-normal-010', data: { eta: eta(20) }, description: 'ORD-010 ETA improved -5min' },
  { tick: 9, type: 'decision', order_id: 'DEMO-normal-012', data: { decision_type: 'alert', reasoning: 'Driver exceeding rest period limit. Recommend mandatory break.', risk_score: 0.35, outcome: 'success', tools: ['DriverMonitor', 'AlertEngine'] }, description: 'ORD-012 rest period alert triggered' },
  { tick: 10, type: 'risk_change', order_id: 'DEMO-normal-007', data: { risk_score: 0.18 }, description: 'ORD-007 risk declining to 0.18' },
  { tick: 11, type: 'alert', order_id: 'DEMO-normal-015', data: { severity: 'info', message: 'Delivery confirmation pending for stop 2' }, description: 'ORD-015 delivery confirmation pending' },
  { tick: 12, type: 'route_update', order_id: 'DEMO-normal-006', data: { stops: 4 }, description: 'ORD-006 route recalculated — added stop' },
]

// ─── SCENARIO 2: Incident Mode ────────────────────────────────────────────

const INCIDENT_ORDERS = [
  makeOrder(1, 'incident', { risk_score: 0.45, delay_minutes: 12, route_efficiency: 55, stops: 5 }),
  makeOrder(2, 'incident', { risk_score: 0.72, delay_minutes: 34, route_efficiency: 30, stops: 4 }),
  makeOrder(3, 'incident', { risk_score: 0.38, delay_minutes: 8, route_efficiency: 60, stops: 3 }),
  makeOrder(4, 'incident', { risk_score: 0.85, delay_minutes: 45, route_efficiency: 20, stops: 6 }),
  makeOrder(5, 'incident', { risk_score: 0.62, delay_minutes: 22, route_efficiency: 40, stops: 4 }),
  makeOrder(6, 'incident', { risk_score: 0.28, delay_minutes: 5, route_efficiency: 70, stops: 3 }),
  makeOrder(7, 'incident', { risk_score: 0.91, delay_minutes: 55, route_efficiency: 15, stops: 5 }),
  makeOrder(8, 'incident', { risk_score: 0.33, delay_minutes: 9, route_efficiency: 65, stops: 4 }),
  makeOrder(9, 'incident', { risk_score: 0.76, delay_minutes: 38, route_efficiency: 25, stops: 5 }),
  makeOrder(10, 'incident', { risk_score: 0.20, delay_minutes: 3, route_efficiency: 80, stops: 2 }),
  makeOrder(11, 'incident', { risk_score: 0.82, delay_minutes: 42, route_efficiency: 22, stops: 5 }),
  makeOrder(12, 'incident', { risk_score: 0.55, delay_minutes: 18, route_efficiency: 45, stops: 4 }),
]

const INCIDENT_EVENTS: DemoEventDef[] = [
  { tick: 1, type: 'alert', order_id: 'DEMO-incident-004', data: { severity: 'critical', message: 'Vehicle deviation detected — 3.2km off route' }, description: 'ORD-004 route deviation alert (critical)' },
  { tick: 1, type: 'risk_change', order_id: 'DEMO-incident-004', data: { risk_score: 0.88 }, description: 'ORD-004 risk spiking to 0.88' },
  { tick: 2, type: 'decision', order_id: 'DEMO-incident-004', data: { decision_type: 'reroute', reasoning: 'Vehicle significantly off-route. Calculating optimal return path.', risk_score: 0.88, outcome: 'success', tools: ['RouteOptimizer', 'TrafficAnalyzer', 'AlertEngine'] }, description: 'ORD-004 reroute initiated' },
  { tick: 2, type: 'route_update', order_id: 'DEMO-incident-004', data: { stops: 5 }, description: 'ORD-004 route optimized — 5 stops recalculated' },
  { tick: 3, type: 'alert', order_id: 'DEMO-incident-007', data: { severity: 'critical', message: 'Driver unresponsive for 15 minutes' }, description: 'ORD-007 driver unresponsive (critical)' },
  { tick: 3, type: 'risk_change', order_id: 'DEMO-incident-007', data: { risk_score: 0.95 }, description: 'ORD-007 risk critical at 0.95' },
  { tick: 4, type: 'decision', order_id: 'DEMO-incident-007', data: { decision_type: 'alert', reasoning: 'Safety protocol triggered. Contacting dispatch and emergency contacts.', risk_score: 0.95, outcome: 'pending', tools: ['SafetyMonitor', 'AlertEngine', 'DriverComms'] }, description: 'ORD-007 safety protocol activated' },
  { tick: 5, type: 'risk_change', order_id: 'DEMO-incident-002', data: { risk_score: 0.78 }, description: 'ORD-002 risk escalating to 0.78' },
  { tick: 5, type: 'alert', order_id: 'DEMO-incident-002', data: { severity: 'warning', message: 'Delivery delay likely exceeds customer SLA' }, description: 'ORD-002 SLA breach warning' },
  { tick: 6, type: 'decision', order_id: 'DEMO-incident-009', data: { decision_type: 'reroute', reasoning: 'Traffic congestion ahead. Redirecting via alternate route to save 12 minutes.', risk_score: 0.76, outcome: 'success', tools: ['RouteOptimizer', 'TrafficAnalyzer'] }, description: 'ORD-009 traffic reroute' },
  { tick: 7, type: 'risk_change', order_id: 'DEMO-incident-011', data: { risk_score: 0.85 }, description: 'ORD-011 risk rising to 0.85' },
  { tick: 8, type: 'alert', order_id: 'DEMO-incident-007', data: { severity: 'success', message: 'Driver back in contact. Status: stable.' }, description: 'ORD-007 driver reconnected' },
  { tick: 8, type: 'risk_change', order_id: 'DEMO-incident-007', data: { risk_score: 0.78 }, description: 'ORD-007 risk decreasing to 0.78' },
  { tick: 9, type: 'decision', order_id: 'DEMO-incident-005', data: { decision_type: 'alert', reasoning: 'Temperature-sensitive cargo at threshold. Notifying driver to check refrigeration unit.', risk_score: 0.62, outcome: 'success', tools: ['CargoMonitor', 'AlertEngine'] }, description: 'ORD-005 cargo temperature alert' },
  { tick: 10, type: 'route_update', order_id: 'DEMO-incident-007', data: { stops: 4 }, description: 'ORD-007 route replanned — nearest safe stop' },
  { tick: 11, type: 'system', order_id: '', data: { message: 'CRITICAL: 4 active incidents require operator attention' }, description: 'Active incidents: 4' },
  { tick: 12, type: 'risk_change', order_id: 'DEMO-incident-004', data: { risk_score: 0.72 }, description: 'ORD-004 risk stabilizing at 0.72 after reroute' },
]

// ─── SCENARIO 3: Peak Load ───────────────────────────────────────────────

const PEAK_ORDERS: DemoOrderDef[] = Array.from({ length: 30 }, (_, i) =>
  makeOrder(i + 1, 'peak', {
    risk_score: 0.12 + (i * 0.025) % 0.6,
    delay_minutes: 1 + (i * 2) % 30,
    route_efficiency: 60 + (i * 0.8) % 35,
    stops: 2 + (i % 5),
    distance_km: 3 + (i * 1.5) % 35,
  }),
)

const PEAK_EVENTS: DemoEventDef[] = [
  { tick: 1, type: 'system', order_id: '', data: { message: 'PEAK LOAD: 30 active orders — 2x normal volume' }, description: 'Peak load: 30 orders active' },
  { tick: 2, type: 'alert', order_id: 'DEMO-peak-005', data: { severity: 'warning', message: 'Order volume exceeding threshold — 28 orders in queue' }, description: 'Volume threshold warning' },
  { tick: 3, type: 'risk_change', order_id: 'DEMO-peak-008', data: { risk_score: 0.42 }, description: 'ORD-008 risk 0.42 under load' },
  { tick: 4, type: 'decision', order_id: 'DEMO-peak-012', data: { decision_type: 'no_action', reasoning: 'Automated systems handling volume. No human intervention needed.', risk_score: 0.35, outcome: 'success', tools: ['AutoRouter'] }, description: 'ORD-012 auto-routing active' },
  { tick: 5, type: 'eta_change', order_id: 'DEMO-peak-003', data: { eta: eta(40) }, description: 'ORD-003 ETA +8min due to volume' },
  { tick: 6, type: 'risk_change', order_id: 'DEMO-peak-015', data: { risk_score: 0.48 }, description: 'ORD-015 risk 0.48 under load' },
  { tick: 7, type: 'route_update', order_id: 'DEMO-peak-010', data: { stops: 4 }, description: 'ORD-010 route optimized for peak' },
  { tick: 8, type: 'alert', order_id: 'DEMO-peak-020', data: { severity: 'info', message: 'Driver Sarah Chen completed 8/12 deliveries' }, description: 'Driver Chen: 8/12 deliveries' },
  { tick: 9, type: 'eta_change', order_id: 'DEMO-peak-018', data: { eta: eta(35) }, description: 'ORD-018 ETA +5min' },
  { tick: 10, type: 'decision', order_id: 'DEMO-peak-022', data: { decision_type: 'alert', reasoning: 'Driver approaching hours-of-service limit. Recommend reassigning remaining deliveries.', risk_score: 0.52, outcome: 'success', tools: ['DriverMonitor', 'ScheduleOptimizer'] }, description: 'ORD-022 HOS limit approaching' },
  { tick: 11, type: 'system', order_id: '', data: { message: 'System load: 72% — all services stable' }, description: 'System at 72% capacity' },
  { tick: 12, type: 'risk_change', order_id: 'DEMO-peak-025', data: { risk_score: 0.38 }, description: 'ORD-025 risk 0.38' },
  { tick: 13, type: 'route_update', order_id: 'DEMO-peak-028', data: { stops: 3 }, description: 'ORD-028 route consolidated — 3 stops' },
  { tick: 14, type: 'decision', order_id: 'DEMO-peak-006', data: { decision_type: 'no_action', reasoning: 'Peak load protocols active. All systems nominal.', risk_score: 0.25, outcome: 'success', tools: ['LoadBalancer'] }, description: 'ORD-006 peak protocols active' },
  { tick: 15, type: 'alert', order_id: 'DEMO-peak-030', data: { severity: 'success', message: 'Fleet operating at 91% efficiency under peak load' }, description: 'Fleet 91% efficiency under peak' },
]

// ─── SCENARIO 4: Weather Disruption ───────────────────────────────────────

const WEATHER_ORDERS = [
  makeOrder(1, 'wthr', { risk_score: 0.68, delay_minutes: 28, route_efficiency: 35, stops: 4, distance_km: 18 }),
  makeOrder(2, 'wthr', { risk_score: 0.82, delay_minutes: 42, route_efficiency: 20, stops: 5, distance_km: 25 }),
  makeOrder(3, 'wthr', { risk_score: 0.45, delay_minutes: 15, route_efficiency: 50, stops: 3, distance_km: 12 }),
  makeOrder(4, 'wthr', { risk_score: 0.76, delay_minutes: 35, route_efficiency: 28, stops: 5, distance_km: 20 }),
  makeOrder(5, 'wthr', { risk_score: 0.58, delay_minutes: 22, route_efficiency: 42, stops: 4, distance_km: 15 }),
  makeOrder(6, 'wthr', { risk_score: 0.72, delay_minutes: 38, route_efficiency: 25, stops: 5, distance_km: 22 }),
  makeOrder(7, 'wthr', { risk_score: 0.35, delay_minutes: 10, route_efficiency: 60, stops: 3, distance_km: 10 }),
  makeOrder(8, 'wthr', { risk_score: 0.88, delay_minutes: 52, route_efficiency: 15, stops: 6, distance_km: 30 }),
  makeOrder(9, 'wthr', { risk_score: 0.50, delay_minutes: 18, route_efficiency: 48, stops: 4, distance_km: 14 }),
  makeOrder(10, 'wthr', { risk_score: 0.65, delay_minutes: 30, route_efficiency: 32, stops: 4, distance_km: 19 }),
]

const WEATHER_EVENTS: DemoEventDef[] = [
  { tick: 1, type: 'system', order_id: '', data: { message: 'WEATHER ALERT: Severe thunderstorm warning in effect for service area' }, description: 'Weather alert: severe thunderstorm' },
  { tick: 1, type: 'risk_change', order_id: 'DEMO-wthr-002', data: { risk_score: 0.82 }, description: 'ORD-002 risk 0.82 — weather impact' },
  { tick: 2, type: 'alert', order_id: 'DEMO-wthr-008', data: { severity: 'critical', message: 'Flooding reported on route — I-95 NB at mile 42' }, description: 'I-95 flooding reported (critical)' },
  { tick: 2, type: 'risk_change', order_id: 'DEMO-wthr-008', data: { risk_score: 0.90 }, description: 'ORD-008 risk critical at 0.90' },
  { tick: 3, type: 'decision', order_id: 'DEMO-wthr-008', data: { decision_type: 'reroute', reasoning: 'I-95 flooding detected. Rerouting via US-1. Estimated +18 minutes.', risk_score: 0.90, outcome: 'success', tools: ['RouteOptimizer', 'WeatherService', 'TrafficAnalyzer'] }, description: 'ORD-008 weather reroute via US-1' },
  { tick: 4, type: 'route_update', order_id: 'DEMO-wthr-008', data: { stops: 5 }, description: 'ORD-008 route recalculated — 5 stops' },
  { tick: 4, type: 'risk_change', order_id: 'DEMO-wthr-004', data: { risk_score: 0.80 }, description: 'ORD-004 risk 0.80 — weather zone' },
  { tick: 5, type: 'alert', order_id: 'DEMO-wthr-006', data: { severity: 'warning', message: 'Visibility reduced to 0.25 miles in northern sector' }, description: 'Visibility 0.25mi — northern sector' },
  { tick: 5, type: 'decision', order_id: 'DEMO-wthr-006', data: { decision_type: 'alert', reasoning: 'Weather conditions deteriorating. Advising driver to reduce speed and use headlights.', risk_score: 0.72, outcome: 'success', tools: ['WeatherService', 'DriverComms'] }, description: 'ORD-006 weather advisory sent' },
  { tick: 6, type: 'risk_change', order_id: 'DEMO-wthr-001', data: { risk_score: 0.72 }, description: 'ORD-001 risk rising to 0.72' },
  { tick: 7, type: 'eta_change', order_id: 'DEMO-wthr-003', data: { eta: eta(50) }, description: 'ORD-003 ETA +15min weather delay' },
  { tick: 8, type: 'decision', order_id: 'DEMO-wthr-002', data: { decision_type: 'reroute', reasoning: 'Hail reported on primary route. Diverting to sheltered route through industrial district.', risk_score: 0.85, outcome: 'success', tools: ['RouteOptimizer', 'WeatherService'] }, description: 'ORD-002 hail diversion' },
  { tick: 9, type: 'system', order_id: '', data: { message: 'Weather system tracking 3 storm cells. Estimated clearance: 90 minutes.' }, description: '3 storm cells — 90min clearance estimate' },
  { tick: 10, type: 'risk_change', order_id: 'DEMO-wthr-009', data: { risk_score: 0.58 }, description: 'ORD-009 risk 0.58 — moderate weather' },
  { tick: 11, type: 'alert', order_id: 'DEMO-wthr-010', data: { severity: 'success', message: 'ORD-005 driver reported clearing skies ahead' }, description: 'ORD-005 clearing skies reported' },
  { tick: 12, type: 'risk_change', order_id: 'DEMO-wthr-005', data: { risk_score: 0.52 }, description: 'ORD-005 risk declining to 0.52' },
]

// ─── SCENARIO 5: Traffic Surge ───────────────────────────────────────────

const TRAFFIC_ORDERS = [
  makeOrder(1, 'trfc', { risk_score: 0.55, delay_minutes: 18, route_efficiency: 45, stops: 4, distance_km: 16 }),
  makeOrder(2, 'trfc', { risk_score: 0.78, delay_minutes: 35, route_efficiency: 25, stops: 5, distance_km: 22 }),
  makeOrder(3, 'trfc', { risk_score: 0.42, delay_minutes: 14, route_efficiency: 52, stops: 3, distance_km: 12 }),
  makeOrder(4, 'trfc', { risk_score: 0.88, delay_minutes: 48, route_efficiency: 18, stops: 5, distance_km: 28 }),
  makeOrder(5, 'trfc', { risk_score: 0.32, delay_minutes: 8, route_efficiency: 65, stops: 3, distance_km: 10 }),
  makeOrder(6, 'trfc', { risk_score: 0.72, delay_minutes: 32, route_efficiency: 30, stops: 5, distance_km: 20 }),
  makeOrder(7, 'trfc', { risk_score: 0.60, delay_minutes: 25, route_efficiency: 38, stops: 4, distance_km: 17 }),
  makeOrder(8, 'trfc', { risk_score: 0.85, delay_minutes: 42, route_efficiency: 22, stops: 5, distance_km: 24 }),
  makeOrder(9, 'trfc', { risk_score: 0.48, delay_minutes: 16, route_efficiency: 48, stops: 4, distance_km: 14 }),
  makeOrder(10, 'trfc', { risk_score: 0.68, delay_minutes: 28, route_efficiency: 35, stops: 4, distance_km: 18 }),
  makeOrder(11, 'trfc', { risk_score: 0.75, delay_minutes: 38, route_efficiency: 28, stops: 5, distance_km: 22 }),
  makeOrder(12, 'trfc', { risk_score: 0.38, delay_minutes: 12, route_efficiency: 58, stops: 3, distance_km: 11 }),
]

const TRAFFIC_EVENTS: DemoEventDef[] = [
  { tick: 1, type: 'system', order_id: '', data: { message: 'TRAFFIC SURGE: Major accident on I-278 at exit 32. All lanes blocked.' }, description: 'I-278 accident — all lanes blocked' },
  { tick: 1, type: 'risk_change', order_id: 'DEMO-trfc-004', data: { risk_score: 0.88 }, description: 'ORD-004 risk 0.88 — traffic impact' },
  { tick: 2, type: 'alert', order_id: 'DEMO-trfc-002', data: { severity: 'critical', message: 'ORD-002 caught in gridlock. Estimated delay: 25+ minutes.' }, description: 'ORD-002 gridlocked — 25+ min delay' },
  { tick: 2, type: 'risk_change', order_id: 'DEMO-trfc-002', data: { risk_score: 0.82 }, description: 'ORD-002 risk 0.82 — gridlock' },
  { tick: 3, type: 'decision', order_id: 'DEMO-trfc-004', data: { decision_type: 'reroute', reasoning: 'Major accident blocking primary route. Rerouting via BQE and Williamsburg Bridge.', risk_score: 0.88, outcome: 'success', tools: ['RouteOptimizer', 'TrafficAnalyzer'] }, description: 'ORD-004 traffic reroute via BQE' },
  { tick: 4, type: 'route_update', order_id: 'DEMO-trfc-004', data: { stops: 5 }, description: 'ORD-004 route recalculated' },
  { tick: 4, type: 'decision', order_id: 'DEMO-trfc-002', data: { decision_type: 'reroute', reasoning: 'Gridlock on primary route. Alternative route through side streets identified. Estimated savings: 15 minutes.', risk_score: 0.82, outcome: 'success', tools: ['TrafficAnalyzer', 'RouteOptimizer'] }, description: 'ORD-002 side street reroute' },
  { tick: 5, type: 'alert', order_id: 'DEMO-trfc-008', data: { severity: 'warning', message: 'Secondary accident on I-278 southbound at exit 28' }, description: 'Secondary accident I-278 SB exit 28' },
  { tick: 5, type: 'risk_change', order_id: 'DEMO-trfc-008', data: { risk_score: 0.88 }, description: 'ORD-008 risk 0.88 — secondary accident' },
  { tick: 6, type: 'eta_change', order_id: 'DEMO-trfc-006', data: { eta: eta(55) }, description: 'ORD-006 ETA +18min traffic' },
  { tick: 7, type: 'decision', order_id: 'DEMO-trfc-008', data: { decision_type: 'reroute', reasoning: 'Secondary accident causing cascading delays. Rerouting entire route cluster.', risk_score: 0.88, outcome: 'success', tools: ['RouteOptimizer', 'TrafficAnalyzer', 'FleetManager'] }, description: 'ORD-008 cluster reroute' },
  { tick: 8, type: 'risk_change', order_id: 'DEMO-trfc-011', data: { risk_score: 0.78 }, description: 'ORD-011 risk 0.78 — spillover traffic' },
  { tick: 9, type: 'system', order_id: '', data: { message: 'Traffic alert: 3 accidents, 18 orders affected, avg delay +22min' }, description: '3 accidents — 18 orders, +22min avg' },
  { tick: 10, type: 'eta_change', order_id: 'DEMO-trfc-007', data: { eta: eta(50) }, description: 'ORD-007 ETA +15min' },
  { tick: 11, type: 'alert', order_id: 'DEMO-trfc-001', data: { severity: 'success', message: 'Traffic clearing on I-278. Rerouted orders recovering.' }, description: 'I-278 clearing — reroutes recovering' },
  { tick: 12, type: 'risk_change', order_id: 'DEMO-trfc-004', data: { risk_score: 0.65 }, description: 'ORD-004 risk declining to 0.65 after reroute' },
]

// ─── SCENARIO 6: Executive Briefing ───────────────────────────────────────

const EXEC_ORDERS = [
  makeOrder(1, 'exec', { risk_score: 0.15, delay_minutes: 2, route_efficiency: 92, stops: 3, distance_km: 8 }),
  makeOrder(2, 'exec', { risk_score: 0.22, delay_minutes: 5, route_efficiency: 85, stops: 4, distance_km: 12 }),
  makeOrder(3, 'exec', { risk_score: 0.68, delay_minutes: 28, route_efficiency: 40, stops: 5, distance_km: 20 }),
  makeOrder(4, 'exec', { risk_score: 0.12, delay_minutes: 1, route_efficiency: 95, stops: 2, distance_km: 6 }),
  makeOrder(5, 'exec', { risk_score: 0.82, delay_minutes: 42, route_efficiency: 22, stops: 5, distance_km: 25 }),
  makeOrder(6, 'exec', { risk_score: 0.28, delay_minutes: 6, route_efficiency: 78, stops: 3, distance_km: 10 }),
  makeOrder(7, 'exec', { risk_score: 0.35, delay_minutes: 10, route_efficiency: 68, stops: 4, distance_km: 14 }),
  makeOrder(8, 'exec', { risk_score: 0.08, delay_minutes: 0, route_efficiency: 98, stops: 2, distance_km: 5 }),
  makeOrder(9, 'exec', { risk_score: 0.72, delay_minutes: 35, route_efficiency: 30, stops: 5, distance_km: 22 }),
  makeOrder(10, 'exec', { risk_score: 0.18, delay_minutes: 3, route_efficiency: 88, stops: 3, distance_km: 9 }),
  makeOrder(11, 'exec', { risk_score: 0.55, delay_minutes: 20, route_efficiency: 50, stops: 4, distance_km: 16 }),
  makeOrder(12, 'exec', { risk_score: 0.08, delay_minutes: 0, route_efficiency: 96, stops: 2, distance_km: 4 }),
]

const EXEC_EVENTS: DemoEventDef[] = [
  { tick: 1, type: 'system', order_id: '', data: { message: 'EXECUTIVE SUMMARY: Fleet performance trending above targets for Q2' }, description: 'Fleet performance above Q2 targets' },
  { tick: 2, type: 'risk_change', order_id: 'DEMO-exec-005', data: { risk_score: 0.82 }, description: 'ORD-005 high-risk — requires executive review' },
  { tick: 3, type: 'decision', order_id: 'DEMO-exec-005', data: { decision_type: 'reroute', reasoning: 'Executive override: Priority shipment rerouted for on-time delivery guarantee.', risk_score: 0.82, outcome: 'success', tools: ['ExecutiveOverride', 'RouteOptimizer'] }, description: 'Exec override: ORD-005 priority reroute' },
  { tick: 4, type: 'risk_change', order_id: 'DEMO-exec-003', data: { risk_score: 0.72 }, description: 'ORD-003 requires monitoring' },
  { tick: 5, type: 'system', order_id: '', data: { message: 'KPI: On-time rate 94.2% (+2.1% MoM), Avg delay 8.3min (-15% YoY)' }, description: 'KPI: 94.2% on-time, 8.3min avg delay' },
  { tick: 6, type: 'alert', order_id: 'DEMO-exec-009', data: { severity: 'warning', message: 'High-value shipment at risk — $45K insured value' }, description: '$45K shipment at risk — exec attention' },
  { tick: 7, type: 'decision', order_id: 'DEMO-exec-009', data: { decision_type: 'alert', reasoning: 'Executive dashboard alert: High-value shipment requires proactive monitoring and escalation path.', risk_score: 0.72, outcome: 'success', tools: ['ExecutiveDashboard', 'AlertEngine'] }, description: 'Exec dashboard: monitoring activated' },
  { tick: 8, type: 'system', order_id: '', data: { message: 'AI Interventions YTD: 1,247 — 96.3% success rate — $2.1M estimated savings' }, description: 'AI: 1,247 interventions, 96.3% success, $2.1M saved' },
  { tick: 9, type: 'risk_change', order_id: 'DEMO-exec-011', data: { risk_score: 0.48 }, description: 'ORD-011 moderate risk — within acceptable range' },
  { tick: 10, type: 'alert', order_id: '', data: { severity: 'success', message: 'Q4 projection: 12% improvement in on-time delivery rate' }, description: 'Q4 projection: +12% on-time delivery' },
  { tick: 11, type: 'system', order_id: '', data: { message: 'Executive summary ready — Generated from 1,452 data points across 8 systems' }, description: 'Summary: 1,452 data points, 8 systems' },
  { tick: 12, type: 'risk_change', order_id: 'DEMO-exec-005', data: { risk_score: 0.58 }, description: 'ORD-005 risk reduced to 0.58 after intervention' },
]

// ─── Registry ─────────────────────────────────────────────────────────────

export const SCENARIOS: Record<ScenarioType, ScenarioDefinition> = {
  normal: {
    meta: {
      id: 'normal', label: 'Normal Operations', description: 'Standard fleet activity with routine events and minor variations',
      icon: 'activity', durationMinutes: 12, eventCount: NORMAL_EVENTS.length,
    },
    orders: NORMAL_ORDERS,
    events: NORMAL_EVENTS,
  },
  incident: {
    meta: {
      id: 'incident', label: 'Incident Mode', description: 'Multiple critical incidents requiring operator intervention',
      icon: 'alert', durationMinutes: 12, eventCount: INCIDENT_EVENTS.length,
    },
    orders: INCIDENT_ORDERS,
    events: INCIDENT_EVENTS,
  },
  peak_load: {
    meta: {
      id: 'peak_load', label: 'Peak Load', description: 'High-volume operations with 2x normal order count',
      icon: 'chart', durationMinutes: 15, eventCount: PEAK_EVENTS.length,
    },
    orders: PEAK_ORDERS,
    events: PEAK_EVENTS,
  },
  weather: {
    meta: {
      id: 'weather', label: 'Weather Disruption', description: 'Severe weather impacting routes and ETAs across the fleet',
      icon: 'cloud', durationMinutes: 12, eventCount: WEATHER_EVENTS.length,
    },
    orders: WEATHER_ORDERS,
    events: WEATHER_EVENTS,
  },
  traffic: {
    meta: {
      id: 'traffic', label: 'Traffic Surge', description: 'Major accidents causing city-wide traffic disruptions',
      icon: 'road', durationMinutes: 12, eventCount: TRAFFIC_EVENTS.length,
    },
    orders: TRAFFIC_ORDERS,
    events: TRAFFIC_EVENTS,
  },
  executive: {
    meta: {
      id: 'executive', label: 'Executive Briefing', description: 'High-level KPI review with strategic decision-making',
      icon: 'briefcase', durationMinutes: 12, eventCount: EXEC_EVENTS.length,
    },
    orders: EXEC_ORDERS,
    events: EXEC_EVENTS,
  },
}

export const SCENARIO_LIST: ScenarioMeta[] = Object.values(SCENARIOS).map(s => s.meta)

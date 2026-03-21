import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import L, { type DivIcon, type LatLngExpression, type LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  MessageSquare,
  Navigation,
  RefreshCcw,
  Send,
  Waypoints,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ConnectionStatus } from '../components/shared';
import DriverCard from '../components/shared/DriverCard';
import { COLORS as DS_COLORS } from '../design-system';
import { apiClient } from '../api';
import { useDispatchWebSocket, useExplanation, useHealthStatus } from '../hooks';
import { useAppContext } from '../context/AppContext';

const COLORS = {
  bg: DS_COLORS.bg,
  surface: DS_COLORS.surface,
  card: DS_COLORS.card,
  border: DS_COLORS.border,
  accent: DS_COLORS.teal,
  warning: DS_COLORS.amber,
  danger: DS_COLORS.red,
  text: DS_COLORS.textPrimary,
  muted: DS_COLORS.textMuted,
  success: '#22C55E',
};

const DEFAULT_TENANT_ID = 'demo-tenant-001';
const API_ORIGIN = apiClient.baseURL.replace(/\/api\/v1\/?$/, '');

const DRIVER_ROUTE_COLORS = ['#00D4AA', '#F59E0B', '#A855F7', '#FB7185'];

const FEATURE_LABELS: Record<string, string> = {
  distance_km: 'Delivery distance',
  traffic_ratio: 'Traffic conditions',
  traffic_deviation: 'Traffic deviation',
  driver_familiarity: 'Driver familiarity',
  zone_familiarity: 'Zone familiarity',
};

const humanizeFeature = (feature: string): string => {
  if (!feature) return 'Factor';
  const normalized = feature.toLowerCase();
  if (FEATURE_LABELS[normalized]) return FEATURE_LABELS[normalized];
  return normalized
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

type DriverStatus = 'on_route' | 'deviating' | 'delayed' | 'offline';
type ToastType = 'info' | 'warning' | 'danger' | 'success';
type IntelTab = 'route' | 'ml' | 'demand' | 'actions';
type PanelState = 'default' | 'selected' | 'deviation';
type ServiceState = 'healthy' | 'degraded' | 'unhealthy';

type DriverETAStat = {
  id: string;
  deltaMin: number;
  onTime: boolean;
};

type Driver = {
  id: string;
  name: string;
  vehicleType: 'bike' | 'auto' | 'car';
  status: DriverStatus;
  lat: number;
  lng: number;
  headingDegrees: number;
  headingCardinal: string;
  speedKmh: number;
  currentZone: string;
  stopIndex: number;
  totalStops: number;
  stopsLeft: number;
  nextEtaMin: number;
  confidence: number;
  routeProgressPct: number;
  last3Etas: DriverETAStat[];
  offRouteMeters?: number;
  delayMinutes?: number;
};

type OrderStatus = 'scheduled' | 'in_progress' | 'completed';

type Order = {
  id: string;
  orderNumber: string;
  driverId?: string;
  pickupName: string;
  deliveryName: string;
  lat: number;
  lng: number;
  status: OrderStatus;
  etaMin: number;
  confidence: number;
  trafficDelayMin: number;
  rushHourDelayMin: number;
  createdAtIso: string;
  completedAtIso?: string;
};

type RoutePath = {
  driverId: string;
  fullPath: LatLngTuple[];
  completedPath: LatLngTuple[];
  remainingPath: LatLngTuple[];
};

type KPIAnalytics = {
  fleetUtilization: number;
  avgEtaAccuracy: number;
  active: number;
  completed: number;
  late: number;
  totalDistanceKm: number;
};

type ModelPoint = {
  hour: string;
  mae: number;
};

type ZoneAccuracy = {
  zone: string;
  accuracyPct: number;
};

type DriftFeature = {
  feature: string;
  score: number;
  label: 'stable' | 'watch' | 'critical';
};

type MLHealth = {
  modelVersion: string;
  trainingDeliveries: number;
  maeRange: [number, number];
  points24h: ModelPoint[];
  zoneAccuracy: ZoneAccuracy[];
  driftFeatures: DriftFeature[];
};

type DelayFactor = {
  feature: string;
  impactMin: number;
};

type ExplainPayload = {
  orderId: string;
  etaMin: number;
  etaP10: number;
  etaP50: number;
  etaP90: number;
  confidenceWithin5Min: number;
  topFactors: DelayFactor[];
  whatHappened: string;
};

type TimelineEvent = {
  id: string;
  orderId: string;
  label: string;
  minuteOfDay: number;
  state: 'on_time' | 'late' | 'in_progress' | 'scheduled';
};

type HealthPayload = {
  api: ServiceState;
  redis: ServiceState;
  celery: ServiceState;
  db: ServiceState;
  workers: number;
};

type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
};

type PositionMotion = {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  startedAt: number;
  durationMs: number;
  headingDegrees: number;
  speedKmh: number;
  routeProgressPct: number;
  currentZone: string;
  nextEtaMin: number;
  stopsLeft: number;
};

type AnimatedPosition = {
  lat: number;
  lng: number;
  headingDegrees: number;
  speedKmh: number;
  routeProgressPct: number;
  currentZone: string;
  nextEtaMin: number;
  stopsLeft: number;
};

type DriverCardModel = {
  id: string;
  name: string;
  vehicleType: 'bike' | 'auto' | 'car';
  status: 'on_route' | 'delayed' | 'deviated' | 'offline';
  currentZone: string;
  speed: number;
  heading: number;
  routeProgress: number;
  stopsRemaining: number;
  etaNextStop: number;
  etaConfidence: number;
  lastThreeETAs: Array<{ deviation: number }>;
  isDeviating: boolean;
  deviationMeters?: number;
};

type WSMessage =
  | {
      type: 'position_update';
      driver_id: string;
      lat: number;
      lng: number;
      heading_degrees?: number;
      speed_kmh?: number;
      progress_pct?: number;
      current_zone?: string;
      stops_left?: number;
      next_eta_min?: number;
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
    };

function toCardinalHeading(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((deg % 360) / 45)) % 8;
  return dirs[(index + 8) % 8];
}

function statusColor(status: DriverStatus): string {
  if (status === 'deviating') return COLORS.danger;
  if (status === 'delayed') return COLORS.warning;
  if (status === 'offline') return COLORS.muted;
  return COLORS.success;
}

function statusRank(status: DriverStatus): number {
  if (status === 'deviating') return 0;
  if (status === 'on_route') return 1;
  if (status === 'delayed') return 2;
  return 3;
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildFallbackDrivers(): Driver[] {
  return [
    {
      id: 'drv-ravi',
      name: 'Ravi Kumar',
      vehicleType: 'bike',
      status: 'on_route',
      lat: 17.4477,
      lng: 78.3921,
      headingDegrees: 38,
      headingCardinal: 'NE',
      speedKmh: 28,
      currentZone: 'Madhapur',
      stopIndex: 2,
      totalStops: 5,
      stopsLeft: 3,
      nextEtaMin: 12,
      confidence: 0.93,
      routeProgressPct: 60,
      last3Etas: [
        { id: 'a', deltaMin: 1, onTime: true },
        { id: 'b', deltaMin: -2, onTime: true },
        { id: 'c', deltaMin: 0, onTime: true },
      ],
    },
    {
      id: 'drv-saleem',
      name: 'Saleem Ahmed',
      vehicleType: 'bike',
      status: 'delayed',
      lat: 17.4399,
      lng: 78.4983,
      headingDegrees: 105,
      headingCardinal: 'E',
      speedKmh: 21,
      currentZone: 'Banjara Hills',
      stopIndex: 3,
      totalStops: 6,
      stopsLeft: 3,
      nextEtaMin: 22,
      confidence: 0.84,
      routeProgressPct: 52,
      delayMinutes: 10,
      last3Etas: [
        { id: 'd', deltaMin: 4, onTime: false },
        { id: 'e', deltaMin: 2, onTime: true },
        { id: 'f', deltaMin: 5, onTime: false },
      ],
    },
    {
      id: 'drv-venkat',
      name: 'Venkat Reddy',
      vehicleType: 'auto',
      status: 'deviating',
      lat: 17.393,
      lng: 78.436,
      headingDegrees: 220,
      headingCardinal: 'SW',
      speedKmh: 18,
      currentZone: 'Ayyappa Society',
      stopIndex: 2,
      totalStops: 5,
      stopsLeft: 3,
      nextEtaMin: 34,
      confidence: 0.74,
      routeProgressPct: 44,
      offRouteMeters: 420,
      last3Etas: [
        { id: 'g', deltaMin: 6, onTime: false },
        { id: 'h', deltaMin: 7, onTime: false },
        { id: 'i', deltaMin: 5, onTime: false },
      ],
    },
    {
      id: 'drv-priya',
      name: 'Priya Singh',
      vehicleType: 'car',
      status: 'offline',
      lat: 17.3598,
      lng: 78.5433,
      headingDegrees: 0,
      headingCardinal: 'N',
      speedKmh: 0,
      currentZone: 'LB Nagar',
      stopIndex: 0,
      totalStops: 0,
      stopsLeft: 0,
      nextEtaMin: 0,
      confidence: 0,
      routeProgressPct: 0,
      last3Etas: [
        { id: 'j', deltaMin: 0, onTime: true },
        { id: 'k', deltaMin: 0, onTime: true },
        { id: 'l', deltaMin: 0, onTime: true },
      ],
    },
  ];
}

function buildFallbackOrders(): Order[] {
  const now = new Date();
  const mk = (offsetMin: number) => new Date(now.getTime() + offsetMin * 60_000).toISOString();
  return [
    {
      id: 'ord-a1',
      orderNumber: 'ORD-A1',
      driverId: 'drv-ravi',
      pickupName: 'Gachibowli',
      deliveryName: 'Hitech City',
      lat: 17.4428,
      lng: 78.3762,
      status: 'completed',
      etaMin: 0,
      confidence: 0.9,
      trafficDelayMin: 2,
      rushHourDelayMin: 1,
      createdAtIso: mk(-400),
      completedAtIso: mk(-310),
    },
    {
      id: 'ord-e3',
      orderNumber: 'ORD-E3',
      driverId: 'drv-venkat',
      pickupName: 'Mehdipatnam',
      deliveryName: 'Tolichowki',
      lat: 17.3981,
      lng: 78.422,
      status: 'in_progress',
      etaMin: 24,
      confidence: 0.82,
      trafficDelayMin: 8,
      rushHourDelayMin: 3,
      createdAtIso: mk(-70),
    },
    {
      id: 'ord-f4',
      orderNumber: 'ORD-F4',
      driverId: 'drv-saleem',
      pickupName: 'Ameerpet',
      deliveryName: 'Secunderabad',
      lat: 17.4559,
      lng: 78.5235,
      status: 'scheduled',
      etaMin: 29,
      confidence: 0.78,
      trafficDelayMin: 5,
      rushHourDelayMin: 2,
      createdAtIso: mk(55),
    },
  ];
}

function normalizeDriver(raw: any): Driver {
  const statusRaw = String(raw.status || 'on_route').toLowerCase();
  let status: DriverStatus = 'on_route';
  if (statusRaw.includes('offline') || statusRaw.includes('break')) status = 'offline';
  else if (statusRaw.includes('deviation') || statusRaw.includes('off_route')) status = 'deviating';
  else if (statusRaw.includes('delay')) status = 'delayed';

  const heading = safeNumber(raw.heading_degrees, 0);
  const totalStops = Math.max(1, safeNumber(raw.total_stops, 5));
  const stopsLeft = Math.max(0, safeNumber(raw.stops_left, 0));
  return {
    id: String(raw.id || raw.driver_id || crypto.randomUUID()),
    name: String(raw.name || raw.driver_name || 'Driver'),
    vehicleType: ((raw.vehicle_type || 'bike').toLowerCase() as Driver['vehicleType']) || 'bike',
    status,
    lat: safeNumber(raw.current_lat ?? raw.lat, 17.44),
    lng: safeNumber(raw.current_lng ?? raw.lng, 78.44),
    headingDegrees: heading,
    headingCardinal: toCardinalHeading(heading),
    speedKmh: safeNumber(raw.speed_kmh, 0),
    currentZone: String(raw.current_zone || 'Unknown'),
    stopIndex: Math.max(1, totalStops - stopsLeft),
    totalStops,
    stopsLeft,
    nextEtaMin: safeNumber(raw.next_eta_min, 0),
    confidence: Math.max(0, Math.min(1, safeNumber(raw.confidence_within_5min, 0.85))),
    routeProgressPct: Math.max(0, Math.min(100, safeNumber(raw.progress_pct, 0))),
    offRouteMeters: safeNumber(raw.off_route_meters, 0) || undefined,
    delayMinutes: safeNumber(raw.delay_minutes, 0) || undefined,
    last3Etas: [
      { id: '1', deltaMin: safeNumber(raw.eta_delta_1, 1), onTime: safeNumber(raw.eta_delta_1, 1) <= 2 },
      { id: '2', deltaMin: safeNumber(raw.eta_delta_2, -2), onTime: safeNumber(raw.eta_delta_2, -2) <= 2 },
      { id: '3', deltaMin: safeNumber(raw.eta_delta_3, 0), onTime: safeNumber(raw.eta_delta_3, 0) <= 2 },
    ],
  };
}

function normalizeOrder(raw: any): Order {
  const statusRaw = String(raw.status || 'scheduled').toLowerCase();
  const status: OrderStatus = statusRaw.includes('complete')
    ? 'completed'
    : statusRaw.includes('progress')
      ? 'in_progress'
      : 'scheduled';
  return {
    id: String(raw.id || raw.order_id || crypto.randomUUID()),
    orderNumber: String(raw.order_number || raw.id || 'ORD'),
    driverId: raw.driver_id ? String(raw.driver_id) : undefined,
    pickupName: String(raw.pickup_name || raw.origin || 'Pickup'),
    deliveryName: String(raw.delivery_name || raw.destination || 'Delivery'),
    lat: safeNumber(raw.delivery_lat ?? raw.lat, 17.44),
    lng: safeNumber(raw.delivery_lng ?? raw.lng, 78.44),
    status,
    etaMin: safeNumber(raw.predicted_eta_min ?? raw.eta_min, 20),
    confidence: Math.max(0, Math.min(1, safeNumber(raw.confidence_within_5min ?? raw.confidence, 0.82))),
    trafficDelayMin: safeNumber(raw.traffic_delay_min, 8),
    rushHourDelayMin: safeNumber(raw.rush_hour_delay_min, 3),
    createdAtIso: String(raw.created_at || new Date().toISOString()),
    completedAtIso: raw.completed_at ? String(raw.completed_at) : undefined,
  };
}

function createMarkerIcon(driver: Driver, flashing = false, arrived = false): DivIcon {
  const initials = driver.name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return L.divIcon({
    className: 'fleet-driver-marker-wrap',
    html: `
      <div data-testid="driver-marker" class="fleet-driver-marker ${flashing ? 'flash-red' : ''} ${arrived ? 'arrival-bounce' : ''}" style="--driver-color:${statusColor(driver.status)}">
        <span>${initials}</span>
        <div class="fleet-driver-arrow" style="transform: translateX(-50%) rotate(${driver.headingDegrees}deg)"></div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function splitRoute(path: LatLngTuple[], progressPct: number): { done: LatLngTuple[]; todo: LatLngTuple[] } {
  if (!path.length) return { done: [], todo: [] };
  const index = Math.max(1, Math.floor((Math.max(0, Math.min(100, progressPct)) / 100) * path.length));
  return {
    done: path.slice(0, index),
    todo: path.slice(Math.max(0, index - 1)),
  };
}

function buildRoutes(drivers: Driver[], orders: Order[]): RoutePath[] {
  return drivers.map((driver, idx) => {
    const assigned = orders.filter((o) => o.driverId === driver.id);
    const points: LatLngTuple[] = [
      [driver.lat, driver.lng],
      ...assigned.map((o) => [o.lat, o.lng] as LatLngTuple),
    ];
    const withWaypoints: LatLngTuple[] =
      points.length > 1
        ? points
        : [
            [driver.lat, driver.lng] as LatLngTuple,
            [driver.lat + 0.01 + idx * 0.004, driver.lng + 0.02] as LatLngTuple,
            [driver.lat + 0.018, driver.lng - 0.013] as LatLngTuple,
          ];
    const split = splitRoute(withWaypoints, driver.routeProgressPct);
    return {
      driverId: driver.id,
      fullPath: withWaypoints,
      completedPath: split.done,
      remainingPath: split.todo,
    };
  });
}

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function useCountUp(value: number, durationMs = 300): number {
  const [animated, setAnimated] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    const to = value;
    if (from === to) return;

    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        previous.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, value]);

  return animated;
}

function useDriverPositions(drivers: Driver[]) {
  const [positions, setPositions] = useState<Record<string, AnimatedPosition>>({});
  const [arrivedAt, setArrivedAt] = useState<Record<string, number>>({});
  const motionsRef = useRef<Record<string, PositionMotion>>({});

  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      drivers.forEach((d) => {
        if (!next[d.id]) {
          next[d.id] = {
            lat: d.lat,
            lng: d.lng,
            headingDegrees: d.headingDegrees,
            speedKmh: d.speedKmh,
            routeProgressPct: d.routeProgressPct,
            currentZone: d.currentZone,
            nextEtaMin: d.nextEtaMin,
            stopsLeft: d.stopsLeft,
          };
        }
      });
      return next;
    });
  }, [drivers]);

  const animateTo = useCallback(
    (driverId: string, payload: Partial<AnimatedPosition> & { lat: number; lng: number }) => {
      setPositions((prev) => {
        const current =
          prev[driverId] ||
          ({
            lat: payload.lat,
            lng: payload.lng,
            headingDegrees: payload.headingDegrees ?? 0,
            speedKmh: payload.speedKmh ?? 0,
            routeProgressPct: payload.routeProgressPct ?? 0,
            currentZone: payload.currentZone ?? 'Unknown',
            nextEtaMin: payload.nextEtaMin ?? 0,
            stopsLeft: payload.stopsLeft ?? 0,
          } as AnimatedPosition);

        motionsRef.current[driverId] = {
          fromLat: current.lat,
          fromLng: current.lng,
          toLat: payload.lat,
          toLng: payload.lng,
          startedAt: performance.now(),
          durationMs: 9000,
          headingDegrees: payload.headingDegrees ?? current.headingDegrees,
          speedKmh: payload.speedKmh ?? current.speedKmh,
          routeProgressPct: payload.routeProgressPct ?? current.routeProgressPct,
          currentZone: payload.currentZone ?? current.currentZone,
          nextEtaMin: payload.nextEtaMin ?? current.nextEtaMin,
          stopsLeft: payload.stopsLeft ?? current.stopsLeft,
        };
        return prev;
      });
    },
    []
  );

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      setPositions((prev) => {
        const next = { ...prev };
        Object.entries(motionsRef.current).forEach(([driverId, motion]) => {
          const t = Math.min(1, (now - motion.startedAt) / motion.durationMs);
          const eased = 1 - Math.pow(1 - t, 2);
          next[driverId] = {
            lat: motion.fromLat + (motion.toLat - motion.fromLat) * eased,
            lng: motion.fromLng + (motion.toLng - motion.fromLng) * eased,
            headingDegrees: motion.headingDegrees,
            speedKmh: motion.speedKmh,
            routeProgressPct: motion.routeProgressPct,
            currentZone: motion.currentZone,
            nextEtaMin: motion.nextEtaMin,
            stopsLeft: motion.stopsLeft,
          };
          if (t >= 1) {
            delete motionsRef.current[driverId];
            setArrivedAt((prev) => ({ ...prev, [driverId]: Date.now() }));
          }
        });
        return next;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const cleanup = window.setInterval(() => {
      setArrivedAt((prev) => {
        const next: Record<string, number> = {};
        Object.entries(prev).forEach(([driverId, ts]) => {
          if (Date.now() - ts < 500) next[driverId] = ts;
        });
        return next;
      });
    }, 250);

    return () => window.clearInterval(cleanup);
  }, []);

  return { positions, animateTo, arrivedAt };
}

function AnimatedMetric({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const n = useCountUp(value, 300);
  return <>{n.toFixed(decimals)}{suffix}</>;
}

function UtilizationRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 13;
  const c = 2 * Math.PI * r;
  const d = c - (pct / 100) * c;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r={r} stroke="rgba(255,255,255,0.1)" strokeWidth="3" fill="none" />
      <circle
        cx="16"
        cy="16"
        r={r}
        stroke={COLORS.accent}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={d}
        transform="rotate(-90 16 16)"
      />
    </svg>
  );
}

function KPIBar(props: {
  kpis: KPIAnalytics;
  clock: Date;
  alertCount: number;
  flash?: boolean;
}) {
  const { kpis, clock, alertCount, flash } = props;
  return (
    <header data-testid="kpi-bar" className={`fcc-header ${flash ? 'flash' : ''}`}>
      <div className="fcc-logo-wrap">
        <div className="fcc-logo">IntelliLog-AI</div>
        <div className="fcc-logo-sub">Fleet Control Center</div>
      </div>

      <div className="fcc-kpis">
        <div className="fcc-kpi with-ring">
          <UtilizationRing value={kpis.fleetUtilization} />
          <div>
            <small>Fleet Utilization</small>
            <strong data-testid="kpi-fleet-utilization"><AnimatedMetric value={kpis.fleetUtilization} suffix="%" /></strong>
          </div>
        </div>
        <div className="fcc-kpi">
          <small>Avg ETA Accuracy</small>
          <strong><AnimatedMetric value={kpis.avgEtaAccuracy} suffix="%" /></strong>
        </div>
        <div className="fcc-kpi">
          <small>Active</small>
          <strong><AnimatedMetric value={kpis.active} /></strong>
        </div>
        <div className="fcc-kpi">
          <small>Completed</small>
          <strong><AnimatedMetric value={kpis.completed} /></strong>
        </div>
        <div className={`fcc-kpi ${kpis.late > 0 ? 'late-glow' : ''}`}>
          <small>Late</small>
          <strong><AnimatedMetric value={kpis.late} /></strong>
        </div>
        <div className="fcc-kpi">
          <small>Total Distance</small>
          <strong><AnimatedMetric value={kpis.totalDistanceKm} decimals={1} suffix=" km" /></strong>
        </div>
        <div className="fcc-kpi time">
          <small>Time</small>
          <strong>{clock.toLocaleTimeString()}</strong>
        </div>
      </div>

      <button className="fcc-alert" aria-label="Alerts">
        <Bell size={15} />
        {alertCount > 0 && <span className="fcc-alert-badge">{alertCount}</span>}
      </button>
    </header>
  );
}

function MapZoomBridge() {
  const map = useMap();

  useEffect(() => {
    const zoomIn = () => map.zoomIn();
    const zoomOut = () => map.zoomOut();
    window.addEventListener('fcc-zoom-in', zoomIn as EventListener);
    window.addEventListener('fcc-zoom-out', zoomOut as EventListener);
    return () => {
      window.removeEventListener('fcc-zoom-in', zoomIn as EventListener);
      window.removeEventListener('fcc-zoom-out', zoomOut as EventListener);
    };
  }, [map]);

  return null;
}

function FitAllControl({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  const fit = useCallback(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);

  return (
    <button className="map-ctl" onClick={fit} type="button" title="Fit all">
      ⊙
    </button>
  );
}

function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack">
      <AnimatePresence>
        {toasts.map((t) => {
          const color =
            t.type === 'danger'
              ? COLORS.danger
              : t.type === 'warning'
                ? COLORS.warning
                : t.type === 'success'
                  ? COLORS.success
                  : COLORS.accent;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 420, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 230, damping: 24 }}
              className="toast-card"
              style={{ borderColor: `${color}77` }}
            >
              <div className="toast-head">
                <span className="toast-dot" style={{ background: color }} />
                <span>{t.message}</span>
                <button aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
                  <X size={14} />
                </button>
              </div>
              <motion.div
                className="toast-progress"
                style={{ background: color }}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 5, ease: 'linear' }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default function FleetControlCenter() {
  const {
    tenantId,
    selectedDriverId,
    selectedOrderId,
    setSelectedDriverId,
    setSelectedOrderId,
  } = useAppContext();
  const { getExplanation } = useExplanation();
  const { health } = useHealthStatus();
  const resolvedTenantId = tenantId || DEFAULT_TENANT_ID;
  const TENANT_ID = resolvedTenantId;
  const [clock, setClock] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [routes, setRoutes] = useState<RoutePath[]>([]);
  const [kpis, setKpis] = useState<KPIAnalytics>({
    fleetUtilization: 87,
    avgEtaAccuracy: 91,
    active: 4,
    completed: 12,
    late: 2,
    totalDistanceKm: 84.3,
  });
  const [mlHealth, setMlHealth] = useState<MLHealth>({
    modelVersion: 'v_20260320_020000',
    trainingDeliveries: 15_420,
    maeRange: [7.8, 9.2],
    points24h: Array.from({ length: 24 }).map((_, i) => ({
      hour: String(i).padStart(2, '0'),
      mae: Number((8 + Math.sin(i / 2.8) * 0.6 + (i % 5) * 0.03).toFixed(2)),
    })),
    zoneAccuracy: [
      { zone: 'Hitech City', accuracyPct: 94 },
      { zone: 'Banjara Hills', accuracyPct: 91 },
      { zone: 'Secunderabad', accuracyPct: 82 },
      { zone: 'Old City', accuracyPct: 78 },
    ],
    driftFeatures: [
      { feature: 'distance_km', score: 0.5, label: 'stable' },
      { feature: 'traffic_ratio', score: 0.7, label: 'watch' },
      { feature: 'zone_familiarity', score: 0.4, label: 'stable' },
    ],
  });
  const [delayFactors, setDelayFactors] = useState<DelayFactor[]>([
    { feature: 'traffic_deviation', impactMin: 4 },
    { feature: 'driver_familiarity', impactMin: 2 },
  ]);
  const [tab, setTab] = useState<IntelTab>('route');
  const [panelState, setPanelState] = useState<PanelState>('default');
  const [explain, setExplain] = useState<ExplainPayload | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [socketHealthy, setSocketHealthy] = useState(false);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showMobileSheet, setShowMobileSheet] = useState<'fleet' | 'intel' | null>(null);
  const [serviceHealth, setServiceHealth] = useState<HealthPayload>({
    api: 'healthy',
    redis: 'healthy',
    celery: 'healthy',
    db: 'healthy',
    workers: 3,
  });
  const [reoptimizeLoading, setReoptimizeLoading] = useState(false);
  const [showRetrainModal, setShowRetrainModal] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [flashingDriverIds, setFlashingDriverIds] = useState<Record<string, number>>({});
  const [etaFlashByOrder, setEtaFlashByOrder] = useState<Record<string, number>>({});
  const [deviationLine, setDeviationLine] = useState<{ expected?: LatLngTuple; actual?: LatLngTuple } | null>(null);
  const [headerFlash, setHeaderFlash] = useState(false);
  const lastPositionUpdateAtRef = useRef(0);
  // Performance note: keep an imperative map ref for direct map interactions.
  const mapRef = useRef<L.Map | null>(null);
  const cardCacheRef = useRef<Record<string, { signature: string; data: DriverCardModel }>>({});

  const { positions, animateTo, arrivedAt } = useDriverPositions(drivers);

  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message, createdAt: Date.now() }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchDriversOrders = useCallback(async () => {
    try {
      const [dRaw, oRaw] = await Promise.all([
        apiClient.getDriversNearby(17.44, 78.44, 50),
        apiClient.getOrders({ status: 'active' }),
      ]);

      const nextDrivers = (dRaw as any[]).map(normalizeDriver);
      const nextOrders = (oRaw as any[]).map(normalizeOrder);
      const finalDrivers = nextDrivers.length ? nextDrivers : buildFallbackDrivers();
      const finalOrders = nextOrders.length ? nextOrders : buildFallbackOrders();

      setDrivers(finalDrivers);
      setOrders(finalOrders);
      setRoutes(buildRoutes(finalDrivers, finalOrders));
      setLastUpdated(new Date());
    } catch {
      const fallbackDrivers = buildFallbackDrivers();
      const fallbackOrders = buildFallbackOrders();
      setDrivers(fallbackDrivers);
      setOrders(fallbackOrders);
      setRoutes(buildRoutes(fallbackDrivers, fallbackOrders));
      pushToast('warning', 'Using fallback fleet snapshot. Backend sync pending.');
    }
  }, [pushToast]);

  const fetchKpis = useCallback(async () => {
    try {
      const res = await fetch(`${API_ORIGIN}/api/v1/analytics/kpis?tenant_id=${TENANT_ID}&date=today`);
      const data = await res.json();
      setKpis({
        fleetUtilization: safeNumber(data.fleet_utilization, 87),
        avgEtaAccuracy: safeNumber(data.avg_eta_accuracy, 91),
        active: safeNumber(data.active_drivers, 4),
        completed: safeNumber(data.completed_orders, 12),
        late: safeNumber(data.late_orders, 2),
        totalDistanceKm: safeNumber(data.total_distance_km, 84.3),
      });
    } catch {
      // Keep previous values if KPI endpoint is unavailable.
    }
  }, []);

  const fetchMLHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_ORIGIN}/api/v1/learning/models/performance?tenant_id=${TENANT_ID}`);
      const data = await res.json();
      const points = Array.isArray(data?.mae_last_24h)
        ? data.mae_last_24h.map((v: any, idx: number) => ({ hour: String(idx).padStart(2, '0'), mae: safeNumber(v, 8.5) }))
        : mlHealth.points24h;

      setMlHealth((prev) => ({
        modelVersion: String(data?.model_version || prev.modelVersion),
        trainingDeliveries: safeNumber(data?.training_data_size, prev.trainingDeliveries),
        maeRange: [
          safeNumber(data?.mae_min, prev.maeRange[0]),
          safeNumber(data?.mae_max, prev.maeRange[1]),
        ],
        points24h: points,
        zoneAccuracy: prev.zoneAccuracy,
        driftFeatures: [
          {
            feature: 'distance_km',
            score: safeNumber(data?.drift?.distance_km?.score, 0.5),
            label: (data?.drift?.distance_km?.label || 'stable') as DriftFeature['label'],
          },
          {
            feature: 'traffic_ratio',
            score: safeNumber(data?.drift?.traffic_ratio?.score, 0.7),
            label: (data?.drift?.traffic_ratio?.label || 'watch') as DriftFeature['label'],
          },
          {
            feature: 'zone_familiarity',
            score: safeNumber(data?.drift?.zone_familiarity?.score, 0.4),
            label: (data?.drift?.zone_familiarity?.label || 'stable') as DriftFeature['label'],
          },
        ],
      }));
    } catch {
      // Keep previous values on network failure.
    }
  }, [mlHealth.points24h]);

  const fetchDelayFactors = useCallback(async () => {
    try {
      const res = await fetch(`${API_ORIGIN}/api/v1/analytics/delay-factors?tenant_id=${TENANT_ID}&date=today`);
      const data = await res.json();
      const zones = (Array.isArray(data?.zone_accuracy) ? data.zone_accuracy : []).map((z: any) => ({
        zone: String(z.zone || 'Zone'),
        accuracyPct: safeNumber(z.accuracy_pct, 80),
      }));
      const factors = (Array.isArray(data?.factors) ? data.factors : []).map((f: any) => ({
        feature: String(f.feature || 'factor'),
        impactMin: safeNumber(f.impact_min, 1),
      }));
      if (zones.length) setMlHealth((prev) => ({ ...prev, zoneAccuracy: zones }));
      if (factors.length) setDelayFactors(factors);
    } catch {
      // Optional analytics endpoint.
    }
  }, []);

  const pollHealth = useCallback(async () => {
    try {
      const data = await apiClient.getSystemStatus();
      setServiceHealth({
        api: (data.api || (data.status === 'operational' || data.status === 'ok' ? 'healthy' : 'degraded')) as ServiceState,
        redis: (data.redis || 'healthy') as ServiceState,
        celery: (data.celery || 'healthy') as ServiceState,
        db: (data.db || 'healthy') as ServiceState,
        workers: safeNumber(data.workers, 3),
      });
    } catch {
      setServiceHealth((prev) => ({ ...prev, api: 'unhealthy' }));
    }
  }, []);
  useEffect(() => {
    if (!health) return;
    setServiceHealth({
      api: (health.api || (health.status === 'operational' || health.status === 'ok' ? 'healthy' : 'degraded')) as ServiceState,
      redis: (health.redis || 'healthy') as ServiceState,
      celery: (health.celery || 'healthy') as ServiceState,
      db: (health.db || 'healthy') as ServiceState,
      workers: safeNumber(health.workers, 3),
    });
  }, [health]);
  const fetchExplain = useCallback(
    async (orderId: string, driverId?: string) => {
      try {
        const data = await getExplanation(orderId, driverId);
        setExplain({
          orderId,
          etaMin: safeNumber(data?.eta_minutes, 24),
          etaP10: safeNumber(data?.eta_p10, 20),
          etaP50: safeNumber(data?.eta_minutes, 24),
          etaP90: safeNumber(data?.eta_p90, 34),
          confidenceWithin5Min: safeNumber(data?.confidence_within_5min, 0.82),
          topFactors: (Array.isArray(data?.factors) ? data.factors : delayFactors)
            .slice(0, 3)
            .map((f: any) => ({
              feature: String(f.feature || 'factor').replaceAll('_', ' '),
              impactMin: Math.abs(safeNumber(f.impact_minutes ?? f.impactMin, 2)),
            })),
          whatHappened:
            data?.summary ||
            'Driver took alternate route through Ayyappa Society Road; main corridor traffic was 2.1x at departure.',
        });
      } catch {
        setExplain({
          orderId,
          etaMin: 34,
          etaP10: 28,
          etaP50: 34,
          etaP90: 40,
          confidenceWithin5Min: 0.78,
          topFactors: [
            { feature: 'Traffic deviation', impactMin: 4 },
            { feature: 'Driver familiarity', impactMin: 2 },
          ],
          whatHappened:
            'Driver took alternate route through Ayyappa Society Road; main corridor traffic was 2.1x at departure.',
        });
      }
    },
    [delayFactors, getExplanation]
  );

  const triggerRouteOptimize = useCallback(async () => {
    setReoptimizeLoading(true);
    pushToast('info', 'Running network-wide route optimization...');
    try {
      await apiClient.optimizeRoutes({ method: 'ortools', use_ml: true });
      await fetchDriversOrders();
      pushToast('success', 'Active routes re-optimized and map paths refreshed.');
    } catch {
      pushToast('danger', 'Route optimization failed. Please retry.');
    } finally {
      setReoptimizeLoading(false);
    }
  }, [fetchDriversOrders, pushToast]);

  const triggerRetrain = useCallback(async () => {
    setShowRetrainModal(false);
    pushToast('info', 'Manual model retraining triggered.');
    try {
      await fetch(`${API_ORIGIN}/api/v1/learning/models/retrain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: TENANT_ID }),
      });
      pushToast('success', 'Retraining started. New metrics will appear after completion.');
    } catch {
      pushToast('warning', 'Retrain endpoint unavailable in this environment.');
    }
  }, [pushToast]);

  const triggerDriftCheck = useCallback(async () => {
    pushToast('info', 'Running drift check now...');
    try {
      await fetch(`${API_ORIGIN}/api/v1/learning/models/drift-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: TENANT_ID }),
      });
      await fetchMLHealth();
      pushToast('success', 'Drift check complete. ML Health updated.');
      setTab('ml');
    } catch {
      pushToast('warning', 'Drift check endpoint unavailable; using last known drift metrics.');
      setTab('ml');
    }
  }, [fetchMLHealth, pushToast]);

  const exportReport = useCallback(async () => {
    try {
      const res = await fetch(`${API_ORIGIN}/api/v1/analytics/export?tenant_id=${TENANT_ID}&date=today`);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `fleet-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(href);
      pushToast('success', 'Performance report downloaded.');
    } catch {
      pushToast('warning', 'Report export endpoint unavailable.');
    }
  }, [pushToast]);

  const sendBroadcast = useCallback(async () => {
    if (!broadcastText.trim()) return;
    try {
      await fetch(`${API_ORIGIN}/api/v1/driver/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: TENANT_ID, message: broadcastText.trim() }),
      });
      pushToast('success', 'Broadcast sent to all active drivers.');
      setBroadcastText('');
    } catch {
      pushToast('warning', 'Broadcast endpoint unavailable in this environment.');
    }
  }, [broadcastText, pushToast]);

  const onWSMessage = useCallback(
    (msg: WSMessage) => {
      setLastUpdated(new Date());

      if (msg.type === 'position_update') {
        // Performance safeguard: cap position updates at 10/s.
        const now = performance.now();
        if (now - lastPositionUpdateAtRef.current < 100) return;
        lastPositionUpdateAtRef.current = now;

        animateTo(msg.driver_id, {
          lat: msg.lat,
          lng: msg.lng,
          headingDegrees: safeNumber(msg.heading_degrees, 0),
          speedKmh: safeNumber(msg.speed_kmh, 0),
          routeProgressPct: safeNumber(msg.progress_pct, 0),
          currentZone: msg.current_zone || 'Unknown',
          nextEtaMin: safeNumber(msg.next_eta_min, 0),
          stopsLeft: safeNumber(msg.stops_left, 0),
        });

        setDrivers((prev) =>
          prev.map((d) =>
            d.id !== msg.driver_id
              ? d
              : {
                  ...d,
                  lat: msg.lat,
                  lng: msg.lng,
                  headingDegrees: safeNumber(msg.heading_degrees, d.headingDegrees),
                  headingCardinal: toCardinalHeading(safeNumber(msg.heading_degrees, d.headingDegrees)),
                  speedKmh: safeNumber(msg.speed_kmh, d.speedKmh),
                  routeProgressPct: safeNumber(msg.progress_pct, d.routeProgressPct),
                  currentZone: msg.current_zone || d.currentZone,
                  nextEtaMin: safeNumber(msg.next_eta_min, d.nextEtaMin),
                  stopsLeft: safeNumber(msg.stops_left, d.stopsLeft),
                }
          )
        );
        return;
      }

      if (msg.type === 'deviation_alert') {
        const distance = safeNumber(msg.distance_m, 420);
        setDrivers((prev) => {
          const next = prev
            .map((d): Driver =>
              d.id === msg.driver_id ? { ...d, status: 'deviating' as DriverStatus, offRouteMeters: distance } : d
            )
            .sort((a, b) => statusRank(a.status) - statusRank(b.status));
          return next;
        });

        setSelectedDriverId(msg.driver_id);
        setHeaderFlash(true);
        window.setTimeout(() => setHeaderFlash(false), 360);
        setPanelState('deviation');
        setTab('route');
        setFlashingDriverIds((prev) => ({ ...prev, [msg.driver_id]: Date.now() }));
        if (msg.expected_lat !== undefined && msg.expected_lng !== undefined && msg.actual_lat !== undefined && msg.actual_lng !== undefined) {
          setDeviationLine({
            expected: [msg.expected_lat, msg.expected_lng],
            actual: [msg.actual_lat, msg.actual_lng],
          });
        }

        pushToast('danger', `Ravi Kumar off route ${Math.round(distance)}m — 3 consecutive readings`);
        window.setTimeout(() => {
          setFlashingDriverIds((prev) => {
            const next = { ...prev };
            delete next[msg.driver_id];
            return next;
          });
        }, 2500);
        return;
      }

      if (msg.type === 'eta_update') {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === msg.order_id
              ? {
                  ...o,
                  etaMin: safeNumber(msg.eta_min, o.etaMin),
                  confidence: Math.max(0, Math.min(1, safeNumber(msg.confidence, o.confidence))),
                }
              : o
          )
        );
        setEtaFlashByOrder((prev) => ({ ...prev, [msg.order_id]: Date.now() }));
        window.setTimeout(() => {
          setEtaFlashByOrder((prev) => {
            const next = { ...prev };
            delete next[msg.order_id];
            return next;
          });
        }, 850);
        return;
      }

      if (msg.type === 'delivery_completed') {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === msg.order_id
              ? { ...o, status: 'completed', completedAtIso: msg.completed_at || new Date().toISOString() }
              : o
          )
        );
        pushToast('success', `Order ${msg.order_id} delivered — feedback recorded`);
        return;
      }

      if (msg.type === 'reoptimize_triggered') {
        pushToast('info', msg.message || 'Route re-optimization triggered from backend');
      }
    },
    [animateTo, pushToast]
  );

  useDispatchWebSocket({
    tenantId: resolvedTenantId,
    onMessage: onWSMessage,
    onOpen: () => setSocketHealthy(true),
    onClose: () => setSocketHealthy(false),
    onError: () => {
      setSocketHealthy(false);
      pushToast('warning', 'Realtime stream degraded. Reconnecting...');
    },
  });

  useEffect(() => {
    fetchDriversOrders();
    fetchKpis();
    fetchMLHealth();
    fetchDelayFactors();
    pollHealth();
  }, [fetchDelayFactors, fetchDriversOrders, fetchKpis, fetchMLHealth, pollHealth]);

  useEffect(() => {
    const second = window.setInterval(() => setClock(new Date()), 1000);
    const kpiTimer = window.setInterval(fetchKpis, 60_000);
    const mlTimer = window.setInterval(fetchMLHealth, 5 * 60_000);
    const delayTimer = window.setInterval(fetchDelayFactors, 10 * 60_000);
    const healthTimer = window.setInterval(pollHealth, 30_000);
    return () => {
      window.clearInterval(second);
      window.clearInterval(kpiTimer);
      window.clearInterval(mlTimer);
      window.clearInterval(delayTimer);
      window.clearInterval(healthTimer);
    };
  }, [fetchDelayFactors, fetchKpis, fetchMLHealth, pollHealth]);

  const sortedDrivers = useMemo(
    () => [...drivers].sort((a, b) => statusRank(a.status) - statusRank(b.status)),
    [drivers]
  );

  const selectedDriver = useMemo(() => drivers.find((d) => d.id === selectedDriverId) || null, [drivers, selectedDriverId]);
  const selectedOrder = useMemo(() => orders.find((o) => o.id === selectedOrderId) || null, [orders, selectedOrderId]);

  const handleDriverSelect = useCallback((driverId: string) => {
    setSelectedDriverId(driverId);
    const first = orders.find((o) => o.driverId === driverId && o.status !== 'completed');
    if (first) setSelectedOrderId(first.id);
    setPanelState('selected');
    setShowMobileSheet('intel');
    if (mapRef.current) {
      const driver = drivers.find((d) => d.id === driverId);
      if (driver) mapRef.current.flyTo([driver.lat, driver.lng], 14, { duration: 1 });
    }
  }, [drivers, orders]);

  const handleDriverReroute = useCallback((_driverId: string) => {
    void apiClient.rerouteNow();
  }, []);

  const driverCards = useMemo(() => {
    return sortedDrivers.map((d) => {
      const mappedStatus: DriverCardModel['status'] =
        d.status === 'on_route' ? 'on_route' : d.status === 'delayed' ? 'delayed' : d.status === 'deviating' ? 'deviated' : 'offline';
      const rawEtas = d.last3Etas.map((s) => ({ deviation: s.deltaMin }));
      const signature = [
        mappedStatus,
        d.currentZone,
        Math.round(d.speedKmh),
        Math.round(d.routeProgressPct),
        d.stopsLeft,
        Math.round(d.nextEtaMin),
        Math.round((d.confidence || 0) * 100),
      ].join('|');
      const cached = cardCacheRef.current[d.id];
      if (cached && cached.signature === signature) return cached.data;

      const data: DriverCardModel = {
        id: d.id,
        name: d.name,
        vehicleType: d.vehicleType,
        status: mappedStatus,
        currentZone: d.currentZone,
        speed: Math.round(d.speedKmh),
        heading: Math.round(d.headingDegrees),
        routeProgress: Math.max(0, Math.min(100, Math.round(d.routeProgressPct))),
        stopsRemaining: d.stopsLeft,
        etaNextStop: Math.round(d.nextEtaMin),
        etaConfidence: Math.round((d.confidence || 0) * 100),
        lastThreeETAs: rawEtas,
        isDeviating: mappedStatus === 'deviated',
        deviationMeters: mappedStatus === 'deviated' ? Math.round(d.offRouteMeters || 420) : undefined,
      };

      cardCacheRef.current[d.id] = { signature, data };
      return data;
    });
  }, [sortedDrivers]);

  useEffect(() => {
    if (!selectedOrderId) return;
    setPanelState('selected');
    // Performance safeguard: debounce explain requests during rapid selection changes.
    const timer = window.setTimeout(() => {
      fetchExplain(selectedOrderId, selectedDriverId || selectedOrder?.driverId);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [fetchExplain, selectedDriverId, selectedOrder?.driverId, selectedOrderId]);

  const alertCount = useMemo(() => {
    const serviceAlerts = Object.values(serviceHealth).filter((v) => v === 'unhealthy').length;
    return toasts.filter((t) => t.type === 'danger' || t.type === 'warning').length + serviceAlerts;
  }, [serviceHealth, toasts]);

  const mapPoints = useMemo<LatLngTuple[]>(() => {
    const pDrivers = drivers.map((d) => [positions[d.id]?.lat ?? d.lat, positions[d.id]?.lng ?? d.lng] as LatLngTuple);
    const pOrders = orders.map((o) => [o.lat, o.lng] as LatLngTuple);
    return [...pDrivers, ...pOrders];
  }, [drivers, orders, positions]);

  useEffect(() => {
    setRoutes(buildRoutes(drivers, orders));
  }, [drivers, orders]);

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    return orders
      .map((o) => {
        const t = o.completedAtIso ? new Date(o.completedAtIso) : new Date(o.createdAtIso);
        const minute = minuteOfDay(t);
        let state: TimelineEvent['state'] = 'scheduled';
        if (o.status === 'in_progress') state = 'in_progress';
        if (o.status === 'completed') state = o.etaMin > 0 ? 'late' : 'on_time';
        return {
          id: o.id,
          orderId: o.id,
          label: o.orderNumber,
          minuteOfDay: minute,
          state,
        };
      })
      .sort((a, b) => a.minuteOfDay - b.minuteOfDay);
  }, [orders]);

  const dayStart = 8 * 60;
  const dayEnd = 17 * 60;
  const nowPosPct = ((minuteOfDay(clock) - dayStart) / (dayEnd - dayStart)) * 100;

  const intelligenceTitle =
    panelState === 'deviation'
      ? 'Deviation Response'
      : panelState === 'selected'
        ? 'Order / Driver Context'
        : 'Operational Intelligence';

  return (
    <div className="fcc-root">
      <style>{`
        .fcc-root { height: 100vh; background:${COLORS.bg}; color:${COLORS.text}; font-family: Inter, system-ui, sans-serif; display:grid; grid-template-rows:56px minmax(0,1fr) 140px; overflow:hidden; }

        .fcc-header { height:56px; background:${COLORS.surface}; border-bottom:1px solid ${COLORS.border}; display:grid; grid-template-columns:220px minmax(0,1fr) 56px; align-items:center; gap:10px; padding:0 10px; }
        .fcc-header.flash { animation: header-flash-red 360ms ease-out 1; }
        @keyframes header-flash-red {
          0% { box-shadow: inset 0 0 0 9999px rgba(239, 68, 68, 0.1); }
          100% { box-shadow: inset 0 0 0 9999px rgba(239, 68, 68, 0); }
        }
        .fcc-logo-wrap { display:flex; flex-direction:column; line-height:1.05; }
        .fcc-logo { font-weight:800; font-size:15px; letter-spacing:0.03em; background:linear-gradient(90deg,#00D4AA,#7df3df); -webkit-background-clip:text; color:transparent; }
        .fcc-logo-sub { color:${COLORS.muted}; font-size:11px; text-transform:uppercase; letter-spacing:0.09em; }
        .fcc-kpis { display:grid; grid-template-columns:repeat(7,minmax(110px,1fr)); gap:8px; min-width:0; }
        .fcc-kpi { background:${COLORS.card}; border:1px solid ${COLORS.border}; border-radius:9px; padding:6px 8px; display:flex; flex-direction:column; min-width:0; }
        .fcc-kpi.with-ring { flex-direction:row; align-items:center; gap:7px; }
        .fcc-kpi small { color:${COLORS.muted}; font-size:10px; text-transform:uppercase; letter-spacing:0.08em; white-space:nowrap; }
        .fcc-kpi strong { font-size:14px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .fcc-kpi.time strong { font-variant-numeric:tabular-nums; }
        .late-glow { border-color:rgba(239,68,68,0.55); animation:pulseLate 1.2s ease-in-out infinite; }
        @keyframes pulseLate { 0%,100%{ box-shadow:0 0 0 rgba(239,68,68,0.0);} 50%{ box-shadow:0 0 16px rgba(239,68,68,0.35);} }

        .fcc-alert { width:36px; height:36px; border-radius:10px; background:${COLORS.card}; border:1px solid ${COLORS.border}; display:grid; place-items:center; position:relative; color:#dbe7f3; }
        .fcc-alert-badge { position:absolute; top:-4px; right:-4px; width:17px; height:17px; border-radius:999px; background:${COLORS.danger}; color:white; font-size:10px; display:grid; place-items:center; }

        .fcc-main { min-height:0; display:grid; grid-template-columns:280px minmax(0,1fr) 360px; gap:10px; padding:10px; overflow:hidden; }
        .zone { background:${COLORS.surface}; border:1px solid ${COLORS.border}; border-radius:12px; min-height:0; overflow:hidden; }
        .zone-title { height:40px; display:flex; align-items:center; justify-content:space-between; padding:0 12px; border-bottom:1px solid ${COLORS.border}; font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#8fa4bf; }

        .fleet-zone { display:flex; flex-direction:column; }
        .fleet-list { min-height:0; overflow:auto; padding:10px; display:flex; flex-direction:column; gap:10px; }
        .driver-card { background:${COLORS.card}; border:1px solid ${COLORS.border}; border-radius:10px; padding:10px; text-align:left; color:#d8e4f4; }
        .driver-card.sel { border-color:rgba(0,212,170,0.6); box-shadow:0 0 0 1px rgba(0,212,170,0.25) inset; }
        .driver-card.offline { opacity:0.55; }
        .driver-card.deviating { border-color:rgba(239,68,68,0.7); }
        .driver-card.delayed { border-color:rgba(245,158,11,0.65); }
        .banner { font-size:11px; border-radius:7px; padding:5px 8px; margin-bottom:8px; font-weight:700; }
        .banner.red { background:rgba(239,68,68,0.14); color:#fecaca; border:1px solid rgba(239,68,68,0.35); }
        .banner.amber { background:rgba(245,158,11,0.13); color:#fcd34d; border:1px solid rgba(245,158,11,0.35); }
        .driver-h { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .dot-name { display:flex; align-items:center; gap:8px; font-weight:700; font-size:13px; }
        .status-dot { width:8px; height:8px; border-radius:999px; animation:pulse 1.3s infinite ease-in-out; }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        .veh-tag { font-size:11px; color:#acc0d8; }
        .driver-meta { font-size:12px; color:#9cb2cb; margin-top:4px; line-height:1.35; }
        .progress-row { margin-top:8px; display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px; }
        .progress-track { height:8px; border-radius:999px; background:#0A1020; overflow:hidden; }
        .progress-fill { height:100%; background:${COLORS.accent}; transition:width 1s ease; }
        .eta-mini { font-size:11px; color:#dafaf2; }
        .eta-hist { margin-top:8px; font-size:11px; color:#a9bfd8; }
        .eta-hist span { margin-right:7px; }
        .eta-good { color:#86efac; }
        .eta-bad { color:#fca5a5; }
        .driver-actions { margin-top:9px; display:flex; gap:6px; }
        .driver-actions button { flex:1; border-radius:7px; border:1px solid ${COLORS.border}; background:#101a2d; color:#cfe0f4; font-size:11px; padding:5px 6px; }
        .driver-actions .danger-btn { border-color:rgba(239,68,68,0.45); color:#fecaca; background:rgba(127,29,29,0.3); }

        .map-zone { position:relative; }
        .map-shell { position:absolute; inset:0; }
        .map-controls { position:absolute; z-index:600; top:10px; right:10px; display:flex; gap:6px; }
        .map-ctl { width:32px; height:32px; border-radius:8px; background:${COLORS.card}; border:1px solid ${COLORS.border}; color:#d7e5f7; display:grid; place-items:center; font-size:13px; }
        .map-ctl.wide { width:auto; padding:0 8px; font-size:11px; }
        .map-ctl.active { border-color:rgba(0,212,170,0.65); color:${COLORS.accent}; }
        .reopt-spin { position:absolute; inset:0; background:rgba(10,10,15,0.5); backdrop-filter:blur(2px); z-index:620; display:grid; place-items:center; }
        .reopt-spin > div { width:42px; height:42px; border:4px solid rgba(0,212,170,0.2); border-top-color:${COLORS.accent}; border-radius:999px; animation:spin 1s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }

        .fleet-driver-marker { width:40px; height:40px; border-radius:999px; border:2px solid var(--driver-color); background:rgba(20,27,45,0.96); display:grid; place-items:center; color:#fff; font-size:11px; font-weight:700; position:relative; box-shadow:0 0 20px color-mix(in srgb, var(--driver-color) 42%, transparent); }
        .fleet-driver-arrow { position:absolute; left:50%; bottom:-4px; width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:10px solid var(--driver-color); transform-origin:center 2px; }
        .flash-red { animation:flash 0.24s linear 3; }
        .arrival-bounce { animation: marker-arrival-bounce 0.4s ease-out 1; }
        @keyframes flash { 0%,100%{filter:none;} 50%{filter:drop-shadow(0 0 9px #EF4444) brightness(1.3);} }
        @keyframes marker-arrival-bounce {
          0% { transform: scale(1); }
          45% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .eta-bubble { transition:all .3s ease; }
        .eta-bubble.bump { transform:translateY(-3px); opacity:.75; }

        .intel-zone { display:flex; flex-direction:column; }
        .intel-body { min-height:0; overflow:auto; padding:10px; display:flex; flex-direction:column; gap:10px; }
        .intel-tabs { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
        .intel-tabs button { border-radius:8px; border:1px solid ${COLORS.border}; background:${COLORS.card}; color:#c8d8ea; font-size:11px; padding:6px; }
        .intel-tabs button.active { border-color:rgba(0,212,170,0.55); color:${COLORS.accent}; }
        .intel-card { background:${COLORS.card}; border:1px solid ${COLORS.border}; border-radius:10px; padding:10px; }
        .intel-card h4 { margin:0 0 8px; font-size:13px; }
        .intel-row { display:flex; justify-content:space-between; font-size:12px; color:#a6bdd7; margin:4px 0; }
        .intel-row strong { color:#e4eef9; }
        .deviation-head { background:rgba(127,29,29,0.45); color:#fecaca; border:1px solid rgba(239,68,68,0.45); border-radius:9px; padding:8px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; }

        .cmp-row { display:grid; grid-template-columns:64px 1fr auto; gap:8px; align-items:center; font-size:12px; color:#a8bfd9; margin:6px 0; }
        .cmp-track { height:8px; background:#0A1020; border-radius:999px; overflow:hidden; }
        .cmp-fill { height:100%; background:${COLORS.accent}; }

        .range-wrap { margin-top:8px; }
        .range-track { height:7px; background:#0A1020; border-radius:999px; position:relative; }
        .range-marker { position:absolute; top:-18px; transform:translateX(-50%); font-size:10px; color:#d6e4f5; }
        .range-pin { position:absolute; top:-3px; width:2px; height:13px; background:${COLORS.accent}; }

        .factor-row { display:grid; grid-template-columns:1fr 110px auto; gap:8px; align-items:center; font-size:12px; color:#a8bdd6; margin:6px 0; }
        .factor-track { height:8px; border-radius:999px; background:#0A1020; overflow:hidden; }
        .factor-fill { height:100%; background:rgba(0,212,170,0.4); width:0%; transition:width .8s ease; }
        .factor-fill.on { background:${COLORS.accent}; }
        .intel-actions { display:flex; gap:8px; }
        .intel-actions button { flex:1; border-radius:8px; border:1px solid ${COLORS.border}; background:#101a2d; color:#d6e4f5; padding:7px 8px; font-size:12px; }
        .intel-actions .primary { background:${COLORS.accent}; border-color:${COLORS.accent}; color:#062a22; font-weight:700; }

        .drift-meter { display:flex; align-items:center; gap:7px; font-size:11px; color:#b3c8df; margin:6px 0; }
        .drift-dots { display:grid; grid-template-columns:repeat(10,8px); gap:2px; }
        .drift-dots i { width:8px; height:8px; border-radius:99px; background:#243349; }
        .drift-dots i.on { background:${COLORS.accent}; }
        .drift-dots i.warn { background:${COLORS.warning}; }
        .drift-dots i.bad { background:${COLORS.danger}; }

        .ghost-forecast { height:170px; border-radius:10px; border:1px dashed rgba(255,255,255,0.15); background:linear-gradient(180deg,rgba(20,27,45,0.9),rgba(12,16,28,0.6)); display:grid; place-items:center; position:relative; overflow:hidden; }
        .ghost-bars { position:absolute; inset:auto 12px 16px; display:flex; gap:8px; align-items:flex-end; filter:blur(1.1px); opacity:0.45; }
        .ghost-bars span { width:22px; border-radius:6px 6px 0 0; background:#3c556e; }
        .ghost-text { text-align:center; max-width:240px; color:#9fb5cf; font-size:12px; line-height:1.35; }

        .bulk-list { display:flex; flex-direction:column; gap:8px; }
        .bulk-item { border:1px solid ${COLORS.border}; background:${COLORS.card}; border-radius:9px; padding:10px; }
        .bulk-item h5 { margin:0; font-size:12px; }
        .bulk-item p { margin:4px 0 8px; font-size:11px; color:#9ab0c8; }
        .bulk-item button { border-radius:7px; border:1px solid ${COLORS.border}; background:#101a2d; color:#d7e6f8; font-size:11px; padding:6px 8px; }
        .bulk-item .cta { background:${COLORS.accent}; border-color:${COLORS.accent}; color:#062b24; font-weight:700; }
        .broadcast { display:flex; gap:6px; margin-top:8px; }
        .broadcast input { flex:1; min-width:0; border-radius:8px; border:1px solid ${COLORS.border}; background:#0B1220; color:#e2edf9; font-size:12px; padding:7px 9px; }

        .timeline-zone { border-top:1px solid ${COLORS.border}; background:#060A12; padding:12px 10px 10px; overflow:hidden; }
        .timeline-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:11px; color:#8fa4bd; text-transform:uppercase; letter-spacing:0.1em; }
        .timeline-track-wrap { position:relative; min-height:86px; overflow-x:auto; overflow-y:hidden; }
        .timeline-line { position:absolute; top:36px; left:0; right:0; height:2px; background:rgba(255,255,255,0.14); min-width:900px; }
        .time-labels { min-width:900px; display:flex; justify-content:space-between; color:#778da7; font-size:11px; }
        .evt { position:absolute; top:28px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:5px; cursor:pointer; }
        .evt-dot { width:11px; height:11px; border-radius:999px; border:2px solid transparent; }
        .evt-dot.on-time { background:#22C55E; }
        .evt-dot.late { background:${COLORS.warning}; }
        .evt-dot.in-progress { border-color:${COLORS.accent}; background:transparent; animation:pulseNow 1.1s infinite; }
        .evt-dot.scheduled { border-color:#6b7280; background:transparent; }
        @keyframes pulseNow { 0%,100%{ box-shadow:0 0 0 0 rgba(0,212,170,0.45);} 60%{ box-shadow:0 0 0 7px rgba(0,212,170,0);} }
        .evt-label { font-size:10px; color:#95aac3; white-space:nowrap; }
        .now-line { position:absolute; top:12px; bottom:12px; width:2px; background:${COLORS.danger}; box-shadow:0 0 12px rgba(239,68,68,0.35); }

        .toast-stack { position:fixed; top:66px; right:12px; z-index:1200; display:flex; flex-direction:column; gap:8px; width:min(360px,92vw); }
        .toast-card { background:${COLORS.card}; border:1px solid; border-radius:10px; overflow:hidden; }
        .toast-head { display:flex; align-items:center; gap:7px; color:#e1ecf8; font-size:12px; padding:10px; }
        .toast-head button { margin-left:auto; color:#95a9c0; }
        .toast-dot { width:8px; height:8px; border-radius:999px; }
        .toast-progress { height:2px; }

        .modal-backdrop { position:fixed; inset:0; z-index:1300; background:rgba(0,0,0,0.55); display:grid; place-items:center; }
        .modal { width:min(420px,92vw); background:${COLORS.surface}; border:1px solid ${COLORS.border}; border-radius:12px; padding:14px; }
        .modal h4 { margin:0 0 8px; }
        .modal p { margin:0 0 10px; color:#9cb1cb; font-size:13px; }
        .modal-actions { display:flex; justify-content:flex-end; gap:8px; }
        .modal-actions button { border-radius:8px; border:1px solid ${COLORS.border}; background:${COLORS.card}; color:#d6e4f8; padding:7px 10px; }
        .modal-actions .danger { background:${COLORS.danger}; border-color:${COLORS.danger}; color:#fff; }

        .mobile-sheet-toggle { display:none; }
        .health-strip { display:flex; gap:8px; flex-wrap:wrap; }
        .svc-pill { font-size:10px; color:#a8bdd5; border:1px solid ${COLORS.border}; background:${COLORS.card}; border-radius:999px; padding:3px 8px; display:flex; align-items:center; gap:6px; }
        .svc-dot { width:7px; height:7px; border-radius:999px; }

        .leaflet-control-attribution,
        .leaflet-control-zoom { display:none !important; }
        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip { background:${COLORS.card} !important; color:#e2ebf8 !important; border:1px solid ${COLORS.border} !important; }
        .leaflet-popup-content { margin:10px !important; }
        .leaflet-container { background:${COLORS.bg} !important; }

        @media (max-width: 1024px) {
          .fcc-root { grid-template-rows:56px minmax(0,1fr) 120px; }
          .fcc-header { grid-template-columns:1fr auto; }
          .fcc-kpis { display:none; }
          .fcc-main { grid-template-columns:1fr; padding:8px; }
          .fleet-zone, .intel-zone { display:none; }
          .mobile-sheet-toggle { position:absolute; left:10px; top:10px; z-index:610; display:flex; gap:6px; }
          .mobile-sheet-toggle button { border-radius:8px; border:1px solid ${COLORS.border}; background:${COLORS.card}; color:#d8e6f8; font-size:11px; padding:6px 8px; }
          .mobile-sheet { position:fixed; left:8px; right:8px; bottom:124px; max-height:50vh; z-index:1050; background:${COLORS.surface}; border:1px solid ${COLORS.border}; border-radius:12px; overflow:auto; }
        }
      `}</style>

      <KPIBar kpis={kpis} clock={clock} alertCount={alertCount} flash={headerFlash} />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <main className="fcc-main">
        <section className="zone fleet-zone">
          <div className="zone-title">
            <span>Fleet List</span>
            <span>{sortedDrivers.length} drivers</span>
          </div>
          <motion.div
            className="fleet-list"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.05 } },
            }}
          >
            {driverCards.map((driver) => (
              <DriverCard
                key={driver.id}
                driver={driver}
                isSelected={selectedDriverId === driver.id}
                onSelect={handleDriverSelect}
                onReroute={handleDriverReroute}
              />
            ))}
          </motion.div>
        </section>

        <section className="zone map-zone">
          <div className="zone-title">
            <span>Live Map</span>
            <div className="health-strip">
              <span className="svc-pill">
                <ConnectionStatus wsStatus={socketHealthy ? 'connected' : 'connecting'} />
              </span>
              <span className="svc-pill">
                <span className="svc-dot" style={{ background: COLORS.accent }} />
                updated {Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000))}s ago
              </span>
            </div>
          </div>

          <div className="map-shell">
            <div className="mobile-sheet-toggle">
              <button onClick={() => setShowMobileSheet((s) => (s === 'fleet' ? null : 'fleet'))}>Fleet</button>
              <button onClick={() => setShowMobileSheet((s) => (s === 'intel' ? null : 'intel'))}>Intel</button>
            </div>

            <MapContainer center={[17.44, 78.44]} zoom={12} style={{ width: '100%', height: '100%' }} zoomControl={false} ref={mapRef as any}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

              {showRoutes &&
                routes.map((route, idx) => {
                  const color = DRIVER_ROUTE_COLORS[idx % DRIVER_ROUTE_COLORS.length];
                  return (
                    <React.Fragment key={route.driverId}>
                      {route.completedPath.length > 1 && (
                        <Polyline
                          positions={route.completedPath as LatLngExpression[]}
                          pathOptions={{ color, opacity: 0.3, weight: 4, dashArray: '8 10' }}
                        />
                      )}
                      {route.remainingPath.length > 1 && (
                        <Polyline
                          positions={route.remainingPath as LatLngExpression[]}
                          pathOptions={{ color, opacity: 0.95, weight: 5 }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}

              {deviationLine?.expected && deviationLine?.actual && (
                <Polyline positions={[deviationLine.expected, deviationLine.actual]} pathOptions={{ color: COLORS.danger, weight: 3, dashArray: '4 8' }} />
              )}

              {drivers.map((d) => {
                const p = positions[d.id];
                const at = p || {
                  lat: d.lat,
                  lng: d.lng,
                  headingDegrees: d.headingDegrees,
                  speedKmh: d.speedKmh,
                  routeProgressPct: d.routeProgressPct,
                  currentZone: d.currentZone,
                  nextEtaMin: d.nextEtaMin,
                  stopsLeft: d.stopsLeft,
                };
                return (
                  <Marker
                    key={d.id}
                    position={[at.lat, at.lng]}
                    icon={createMarkerIcon({ ...d, headingDegrees: at.headingDegrees }, Boolean(flashingDriverIds[d.id]), Boolean(arrivedAt[d.id]))}
                    eventHandlers={{
                      click: () => {
                        setSelectedDriverId(d.id);
                        const linked = orders.find((o) => o.driverId === d.id && o.status !== 'completed');
                        if (linked) setSelectedOrderId(linked.id);
                        setPanelState('selected');
                      },
                    }}
                  />
                );
              })}

              {orders.map((o) => {
                const selected = selectedOrderId === o.id;
                const color = o.status === 'completed' ? COLORS.accent : '#ffffff';
                return (
                  <React.Fragment key={o.id}>
                    <CircleMarker
                      center={[o.lat, o.lng]}
                      radius={8}
                      pathOptions={{
                        color,
                        fillColor: o.status === 'completed' ? COLORS.accent : COLORS.card,
                        fillOpacity: 1,
                        weight: 2,
                      }}
                      eventHandlers={{
                        click: () => {
                          setSelectedOrderId(o.id);
                          if (o.driverId) setSelectedDriverId(o.driverId);
                          setPanelState('selected');
                          setTab('route');
                        },
                      }}
                    >
                      <Popup>
                        <div style={{ minWidth: 220 }}>
                          <strong>{o.orderNumber}</strong>
                          <div>{o.pickupName} → {o.deliveryName}</div>
                          <div className={`eta-bubble ${etaFlashByOrder[o.id] ? 'bump' : ''}`}>ETA: {o.etaMin} min ({Math.round(o.confidence * 100)}% confident)</div>
                          <div>Traffic: +{o.trafficDelayMin} min [SHAP]</div>
                          <div>Rush hour: +{o.rushHourDelayMin} min [SHAP]</div>
                          <button
                            style={{ marginTop: 8, background: 'transparent', border: 'none', color: COLORS.accent, cursor: 'pointer', padding: 0 }}
                            onClick={() => {
                              setSelectedOrderId(o.id);
                              setPanelState('selected');
                              setTab('route');
                            }}
                          >
                            View full explanation →
                          </button>
                        </div>
                      </Popup>
                    </CircleMarker>

                    {selected && (
                      <CircleMarker
                        center={[o.lat, o.lng]}
                        radius={9}
                        pathOptions={{ color: COLORS.accent, fillOpacity: 0, className: 'order-ring' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}

              {showTraffic &&
                [
                  { center: [17.4428, 78.3762] as LatLngTuple, intensity: 0.35 },
                  { center: [17.3981, 78.422] as LatLngTuple, intensity: 0.74 },
                  { center: [17.4559, 78.5235] as LatLngTuple, intensity: 0.9 },
                ].map((z, idx) => (
                  <CircleMarker
                    key={`traffic-${idx}`}
                    center={z.center}
                    radius={44}
                    pathOptions={{
                      stroke: false,
                      fillColor: z.intensity >= 0.8 ? COLORS.danger : z.intensity >= 0.5 ? COLORS.warning : COLORS.success,
                      fillOpacity: 0.12,
                    }}
                  />
                ))}

              <MapZoomBridge />
              <FitAllControl points={mapPoints} />
            </MapContainer>

            <div className="map-controls">
              <button className="map-ctl" onClick={() => window.dispatchEvent(new CustomEvent('fcc-zoom-in'))} title="Zoom in">
                <ZoomIn size={14} />
              </button>
              <button className="map-ctl" onClick={() => window.dispatchEvent(new CustomEvent('fcc-zoom-out'))} title="Zoom out">
                <ZoomOut size={14} />
              </button>
              <button className={`map-ctl wide ${showTraffic ? 'active' : ''}`} onClick={() => setShowTraffic((v) => !v)}>
                Traffic ●
              </button>
              <button className={`map-ctl wide ${showRoutes ? 'active' : ''}`} onClick={() => setShowRoutes((v) => !v)}>
                Routes ●
              </button>
              <button className="map-ctl" onClick={triggerRouteOptimize} title="Re-optimize">
                <RefreshCcw size={14} />
              </button>
            </div>

            {reoptimizeLoading && (
              <div className="reopt-spin" aria-label="Re-optimizing routes">
                <div />
              </div>
            )}
          </div>
        </section>

        <section className="zone intel-zone">
          <div className="zone-title">
            <span>{intelligenceTitle}</span>
            <span>{selectedDriver?.name || selectedOrder?.orderNumber || 'Live view'}</span>
          </div>

          <div className="intel-body">
            <div className="intel-tabs">
              <button className={tab === 'route' ? 'active' : ''} onClick={() => setTab('route')}>Route Intel</button>
              <button data-testid="tab-ml-health" className={tab === 'ml' ? 'active' : ''} onClick={() => setTab('ml')}>ML Health</button>
              <button className={tab === 'demand' ? 'active' : ''} onClick={() => setTab('demand')}>Demand Forecast</button>
              <button className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}>Fleet Actions</button>
            </div>

            {panelState === 'deviation' && selectedDriver && (
              <div className="deviation-head">Deviation detected - {selectedDriver.name}</div>
            )}

            {tab === 'route' && (
              <div className="intel-card">
                <h4>Route comparison</h4>
                <div className="cmp-row">
                  <span>Planned</span>
                  <div className="cmp-track"><div className="cmp-fill" style={{ width: '72%', opacity: 0.7 }} /></div>
                  <strong>28 min</strong>
                </div>
                <div className="cmp-row">
                  <span>Actual</span>
                  <div className="cmp-track"><div className="cmp-fill" style={{ width: '89%' }} /></div>
                  <strong>34 min (+6)</strong>
                </div>

                {selectedOrder && (
                  <>
                    <h4 style={{ marginTop: 12 }}>{selectedOrder.orderNumber} ETA range</h4>
                    <div className="intel-row"><span>{selectedOrder.pickupName} → {selectedOrder.deliveryName}</span><strong>{explain?.etaMin || selectedOrder.etaMin} min</strong></div>
                    <div className="range-wrap">
                      <div className="range-track">
                        <span className="range-marker" style={{ left: '15%' }}>P10 {Math.round(explain?.etaP10 || selectedOrder.etaMin - 4)}</span>
                        <span className="range-marker" style={{ left: '50%' }}>P50 {Math.round(explain?.etaP50 || selectedOrder.etaMin)}</span>
                        <span className="range-marker" style={{ left: '84%' }}>P90 {Math.round(explain?.etaP90 || selectedOrder.etaMin + 6)}</span>
                        <span className="range-pin" style={{ left: '15%' }} />
                        <span className="range-pin" style={{ left: '50%' }} />
                        <span className="range-pin" style={{ left: '84%' }} />
                      </div>
                    </div>
                  </>
                )}

                <h4 style={{ marginTop: 16 }}>SHAP delay breakdown</h4>
                {(explain?.topFactors || delayFactors.slice(0, 3)).map((f, idx) => {
                  const max = Math.max(...(explain?.topFactors || delayFactors).map((x) => x.impactMin));
                  const pct = max > 0 ? (f.impactMin / max) * 100 : 0;
                  return (
                    <div className="factor-row" key={`${f.feature}-${idx}`}>
                      <span>{humanizeFeature(f.feature)}</span>
                      <div className="factor-track">
                        <div className={`factor-fill ${idx === 0 ? 'on' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                      <strong>+{Math.round(f.impactMin)} min</strong>
                    </div>
                  );
                })}

                <div className="intel-card" style={{ marginTop: 10 }}>
                  <h4>What happened</h4>
                  <p style={{ color: '#9cb2cb', margin: 0, fontSize: 12, lineHeight: 1.4 }}>
                    {explain?.whatHappened || 'Driver took alternate route through Ayyappa Society Road - not the optimized path. Traffic on main road was 2.1x at departure.'}
                  </p>
                </div>

                <div className="intel-actions" style={{ marginTop: 10 }}>
                  <button onClick={() => pushToast('info', 'Driver notified with route correction prompt.')}>Notify Driver</button>
                  <button className="primary" onClick={triggerRouteOptimize}>Re-optimize Route</button>
                </div>
              </div>
            )}

            {tab === 'ml' && (
              <>
                <div className="intel-card">
                  <h4>Model performance</h4>
                  <div className="intel-row"><span>Current model</span><strong data-testid="model-version">{mlHealth.modelVersion}</strong></div>
                  <div className="intel-row"><span>Training data</span><strong>{mlHealth.trainingDeliveries.toLocaleString()} deliveries</strong></div>

                  <div style={{ height: 116, marginTop: 8 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mlHealth.points24h}>
                        <XAxis dataKey="hour" hide />
                        <YAxis hide domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                        <Tooltip
                          contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }}
                          formatter={(value: any) => [`${Number(value).toFixed(2)} min`, 'MAE']}
                          labelFormatter={(label) => `${label}:00`}
                        />
                        <Line type="monotone" dataKey="mae" stroke={COLORS.accent} strokeWidth={2.2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="intel-row"><span>Range</span><strong>{mlHealth.maeRange[0]} - {mlHealth.maeRange[1]} min</strong></div>
                </div>

                <div className="intel-card">
                  <h4>Accuracy by zone</h4>
                  <div style={{ height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mlHealth.zoneAccuracy} layout="vertical" margin={{ left: 14, right: 10, top: 4, bottom: 4 }}>
                        <XAxis type="number" hide domain={[0, 100]} />
                        <YAxis type="category" dataKey="zone" width={96} tick={{ fill: '#9bb0c8', fontSize: 11 }} />
                        <Tooltip
                          cursor={false}
                          contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }}
                          formatter={(value: any) => [`${value}%`, 'Accuracy']}
                        />
                        <Bar dataKey="accuracyPct" radius={[6, 6, 6, 6]}>
                          {mlHealth.zoneAccuracy.map((entry) => (
                            <Cell key={entry.zone} fill={entry.accuracyPct < 80 ? COLORS.warning : COLORS.accent} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="intel-card">
                  <h4>Drift status</h4>
                  {mlHealth.driftFeatures.map((f) => {
                    const count = Math.round(Math.max(0, Math.min(1, f.score)) * 10);
                    return (
                      <div className="drift-meter" key={f.feature}>
                        <span style={{ width: 96 }}>{humanizeFeature(f.feature)}</span>
                        <span className="drift-dots">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <i
                              key={`${f.feature}-${i}`}
                              className={
                                i < count
                                  ? f.label === 'critical'
                                    ? 'bad on'
                                    : f.label === 'watch'
                                      ? 'warn on'
                                      : 'on'
                                  : ''
                              }
                            />
                          ))}
                        </span>
                        <strong>{f.label}</strong>
                      </div>
                    );
                  })}

                  <button className="map-ctl wide active" style={{ marginTop: 8 }} onClick={() => setShowRetrainModal(true)}>
                    Trigger manual retrain
                  </button>
                </div>
              </>
            )}

            {tab === 'demand' && (
              <div className="intel-card">
                <h4>Demand Forecast</h4>
                <div className="ghost-forecast">
                  <div className="ghost-bars">
                    {[50, 72, 94, 65, 86, 56, 91, 75].map((h, i) => (
                      <span key={i} style={{ height: `${h}px` }} />
                    ))}
                  </div>
                  <div className="ghost-text">
                    Demand forecasting trains after 30 days of operation.<br />
                    Activates automatically - no setup required.
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div className="intel-row"><span>Lifecycle progress</span><strong>Day 1 of 30</strong></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: '3.3%' }} /></div>
                </div>
              </div>
            )}

            {tab === 'actions' && (
              <div className="bulk-list">
                <div className="bulk-item">
                  <h5>Re-optimize all active routes</h5>
                  <p>Runs VRP solve with current positions and traffic. Updated paths animate on map.</p>
                  <button className="cta" onClick={triggerRouteOptimize}><Waypoints size={12} style={{ marginRight: 5 }} /> Run Optimization</button>
                </div>

                <div className="bulk-item">
                  <h5>Emergency broadcast to all drivers</h5>
                  <p>Send notification to all active driver apps immediately.</p>
                  <div className="broadcast">
                    <input
                      value={broadcastText}
                      onChange={(e) => setBroadcastText(e.target.value)}
                      placeholder="Enter emergency instruction"
                    />
                    <button onClick={sendBroadcast}><Send size={12} /></button>
                  </div>
                </div>

                <div className="bulk-item">
                  <h5>Export today's performance report</h5>
                  <p>Downloads CSV/PDF containing ETAs, actuals, delays, and model attribution fields.</p>
                  <button onClick={exportReport}><Navigation size={12} style={{ marginRight: 5 }} /> Export report</button>
                </div>

                <div className="bulk-item">
                  <h5>Trigger model drift check now</h5>
                  <p>Executes KS test immediately and pushes fresh drift values to ML Health.</p>
                  <button onClick={triggerDriftCheck}><AlertTriangle size={12} style={{ marginRight: 5 }} /> Run drift check</button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <section className="timeline-zone">
        <div className="timeline-head">
          <span>Timeline: Today's delivery stream</span>
          <span>{orders.length} tracked orders</span>
        </div>

        <div className="timeline-track-wrap">
          <div className="time-labels">
            <span>08:00</span>
            <span>09:00</span>
            <span>10:00</span>
            <span>11:00</span>
            <span>12:00</span>
            <span>13:00</span>
            <span>14:00</span>
            <span>15:00</span>
            <span>16:00</span>
            <span>17:00</span>
          </div>
          <div className="timeline-line" />
          <div className="now-line" style={{ left: `${Math.max(0, Math.min(100, nowPosPct))}%` }} />

          {timelineEvents.map((evt) => {
            const left = ((evt.minuteOfDay - dayStart) / (dayEnd - dayStart)) * 100;
            return (
              <button
                key={evt.id}
                className="evt"
                style={{ left: `${Math.max(0, Math.min(100, left))}%` }}
                onClick={() => {
                  setSelectedOrderId(evt.orderId);
                  const linked = orders.find((o) => o.id === evt.orderId);
                  if (linked?.driverId) setSelectedDriverId(linked.driverId);
                  setPanelState('selected');
                  setTab('route');
                }}
                type="button"
              >
                <span className={`evt-dot ${evt.state.replace('_', '-')}`} />
                <span className="evt-label">{evt.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {showMobileSheet === 'fleet' && (
        <div className="mobile-sheet">
          <section className="zone fleet-zone" style={{ border: 'none' }}>
            <div className="zone-title"><span>Fleet List</span><span>{sortedDrivers.length} drivers</span></div>
            <div className="fleet-list">
              {sortedDrivers.map((d) => (
                <button
                  key={`mobile-${d.id}`}
                  className={`driver-card ${d.status} ${d.status === 'offline' ? 'offline' : ''}`}
                  onClick={() => {
                    setSelectedDriverId(d.id);
                    const first = orders.find((o) => o.driverId === d.id && o.status !== 'completed');
                    if (first) setSelectedOrderId(first.id);
                    setPanelState('selected');
                    setShowMobileSheet('intel');
                  }}
                  type="button"
                >
                  <div className="driver-h">
                    <div className="dot-name"><span className="status-dot" style={{ background: statusColor(d.status) }} /><span>{d.name}</span></div>
                    <span className="veh-tag">{d.vehicleType.toUpperCase()}</span>
                  </div>
                  <div className="driver-meta">{d.currentZone} · {Math.round(d.nextEtaMin)} min ETA</div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {showMobileSheet === 'intel' && (
        <div className="mobile-sheet">
          <section className="zone intel-zone" style={{ border: 'none' }}>
            <div className="zone-title"><span>Intelligence</span><span>{selectedDriver?.name || selectedOrder?.orderNumber || 'Live'}</span></div>
            <div className="intel-body">
              <div className="intel-card">
                <h4>Quick actions</h4>
                <div className="intel-actions">
                  <button onClick={triggerRouteOptimize}><RefreshCcw size={12} style={{ marginRight: 4 }} /> Optimize</button>
                  <button className="primary" onClick={() => setTab('ml')}>Open ML Health</button>
                </div>
                <div className="intel-row" style={{ marginTop: 10 }}><span>Message drivers</span><strong><MessageSquare size={13} /></strong></div>
              </div>
            </div>
          </section>
        </div>
      )}

      <AnimatePresence>
        {showRetrainModal && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}>
              <h4>Trigger manual retrain?</h4>
              <p>This action starts an immediate training job for tenant {TENANT_ID}. Existing inference will continue during retraining.</p>
              <div className="modal-actions">
                <button onClick={() => setShowRetrainModal(false)}>Cancel</button>
                <button className="danger" onClick={triggerRetrain}>Start retrain</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}










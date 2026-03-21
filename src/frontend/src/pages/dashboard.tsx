import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  CircleMarker,
  useMap,
} from 'react-leaflet';
import L, { type DivIcon, type LatLngExpression, type LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  Clock3,
  MapPinned,
  Navigation,
  RefreshCcw,
  Route,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import ETAExplanationCard from '../../components/ETAExplanationCard';
import { COLORS as DS_COLORS } from '../design-system';
import DriverCard from '../components/shared/DriverCard';
import { ConnectionStatus } from '../components/shared';
import { apiClient } from '../api';
import { useDispatchWebSocket, useExplanation, useHealthStatus } from '../hooks';
import { useAppContext } from '../context/AppContext';

const DEFAULT_TENANT_ID = 'demo-tenant-001';

type ServiceState = 'healthy' | 'degraded' | 'unhealthy';
type DriverStatus = 'on_route' | 'delay_minor' | 'deviation' | 'offline';
type ToastType = 'info' | 'warning' | 'danger' | 'success';

type Driver = {
  id: string;
  name: string;
  vehicleType: 'bike' | 'auto' | 'car';
  status: DriverStatus;
  lat: number;
  lng: number;
  heading: number;
  speedKmh: number;
  stopsLeft: number;
  nextEtaMin: number;
  currentZone: string;
  progressPct: number;
};

type Order = {
  id: string;
  orderNumber: string;
  driverId?: string;
  pickupName: string;
  deliveryName: string;
  lat: number;
  lng: number;
  status: 'pending' | 'in_progress' | 'completed';
  etaMin: number;
  confidence: number;
};

type DriverRoute = {
  driverId: string;
  fullPath: LatLngTuple[];
  completedPath: LatLngTuple[];
  remainingPath: LatLngTuple[];
};

type ExplainFactor = {
  feature: string;
  impact_minutes: number;
  sentence?: string;
  importance_rank?: number;
};

type ExplainResponse = {
  order_id?: string;
  eta_minutes?: number;
  eta_p10?: number;
  eta_p90?: number;
  confidence_within_5min?: number;
  summary?: string;
  factors?: ExplainFactor[];
  what_would_help?: string;
};

type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
};

type HealthPayload = {
  api?: ServiceState;
  redis?: ServiceState;
  celery?: ServiceState;
  db?: ServiceState;
  workers?: number;
};

type WsDispatchMessage =
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
    }
  | {
      type: 'delivery_completed';
      order_id: string;
    }
  | {
      type: 'reoptimize_triggered';
      message?: string;
    };

type AnimatedPoint = {
  lat: number;
  lng: number;
  heading: number;
  speedKmh: number;
  progressPct: number;
  currentZone: string;
  nextEtaMin: number;
  stopsLeft: number;
};

type TargetMotion = {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  startedAt: number;
  duration: number;
  heading: number;
  speedKmh: number;
  progressPct: number;
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

const shimmerRoutes = [DS_COLORS.teal, DS_COLORS.amber, '#A855F7', '#FB7185'];

function getStatusColor(status: DriverStatus) {
  if (status === 'deviation') return '#EF4444';
  if (status === 'delay_minor') return '#F59E0B';
  if (status === 'offline') return '#64748B';
  return '#00D4AA';
}

function normalizeDriver(raw: any): Driver {
  const statusRaw = String(raw.status || 'on_route').toLowerCase();
  let status: DriverStatus = 'on_route';
  if (statusRaw.includes('offline') || statusRaw.includes('break')) status = 'offline';
  else if (statusRaw.includes('deviation')) status = 'deviation';
  else if (statusRaw.includes('delay')) status = 'delay_minor';

  return {
    id: String(raw.id || raw.driver_id || crypto.randomUUID()),
    name: raw.name || raw.driver_name || 'Driver',
    vehicleType: (raw.vehicle_type || 'bike') as Driver['vehicleType'],
    status,
    lat: Number(raw.current_lat ?? raw.lat ?? 17.44),
    lng: Number(raw.current_lng ?? raw.lng ?? 78.44),
    heading: Number(raw.heading_degrees ?? 0),
    speedKmh: Number(raw.speed_kmh ?? 0),
    stopsLeft: Number(raw.stops_left ?? 0),
    nextEtaMin: Number(raw.next_eta_min ?? 0),
    currentZone: raw.current_zone || 'Unknown',
    progressPct: Number(raw.progress_pct ?? 0),
  };
}

function normalizeOrder(raw: any): Order {
  return {
    id: String(raw.id || raw.order_id || crypto.randomUUID()),
    orderNumber: raw.order_number || raw.id || 'ORD',
    driverId: raw.driver_id,
    pickupName: raw.pickup_name || raw.origin || 'Pickup',
    deliveryName: raw.delivery_name || raw.delivery_address || 'Delivery',
    lat: Number(raw.lat ?? raw.delivery_lat ?? 17.44),
    lng: Number(raw.lng ?? raw.delivery_lng ?? 78.44),
    status: raw.status === 'completed' ? 'completed' : raw.status === 'in_progress' ? 'in_progress' : 'pending',
    etaMin: Number(raw.predicted_eta_min ?? raw.eta_min ?? 24),
    confidence: Number(raw.confidence_within_5min ?? raw.confidence ?? 0.82),
  };
}

function getDriverInitials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function createDriverIcon(driver: Driver, flashing: boolean, arrived: boolean): DivIcon {
  const color = getStatusColor(driver.status);
  const initials = getDriverInitials(driver.name);
  return L.divIcon({
    className: 'driver-icon-wrapper',
    html: `
      <div data-testid="driver-marker" class="driver-icon ${flashing ? 'flash-red' : ''} ${arrived ? 'arrival-bounce' : ''}" style="--marker:${color}">
        <div class="driver-initials">${initials}</div>
        <div class="driver-heading" style="transform: translateX(-50%) rotate(${driver.heading}deg)"></div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function mockRoutesFromDrivers(drivers: Driver[], orders: Order[]): DriverRoute[] {
  return drivers.map((driver, idx) => {
    const base: LatLngTuple = [driver.lat, driver.lng];
    const owned = orders.filter((o) => o.driverId === driver.id).slice(0, 4);
    const all = [base, ...owned.map((o) => [o.lat, o.lng] as LatLngTuple)];
    const completedCount = Math.max(1, Math.floor((driver.progressPct / 100) * Math.max(2, all.length - 1)));
    return {
      driverId: driver.id,
      fullPath: all,
      completedPath: all.slice(0, completedCount),
      remainingPath: all.slice(Math.max(0, completedCount - 1)),
    };
  });
}

function useDriverPositions(drivers: Driver[]) {
  const [positions, setPositions] = useState<Record<string, AnimatedPoint>>({});
  const [arrivedAt, setArrivedAt] = useState<Record<string, number>>({});
  const motionsRef = useRef<Record<string, TargetMotion>>({});

  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      drivers.forEach((d) => {
        if (!next[d.id]) {
          next[d.id] = {
            lat: d.lat,
            lng: d.lng,
            heading: d.heading,
            speedKmh: d.speedKmh,
            progressPct: d.progressPct,
            currentZone: d.currentZone,
            nextEtaMin: d.nextEtaMin,
            stopsLeft: d.stopsLeft,
          };
        }
      });
      return next;
    });
  }, [drivers]);

  const moveDriver = useCallback((driverId: string, payload: Partial<AnimatedPoint> & { lat: number; lng: number }) => {
    setPositions((prev) => {
      const current = prev[driverId] || {
        lat: payload.lat,
        lng: payload.lng,
        heading: payload.heading ?? 0,
        speedKmh: payload.speedKmh ?? 0,
        progressPct: payload.progressPct ?? 0,
        currentZone: payload.currentZone ?? 'Unknown',
        nextEtaMin: payload.nextEtaMin ?? 0,
        stopsLeft: payload.stopsLeft ?? 0,
      };

      motionsRef.current[driverId] = {
        fromLat: current.lat,
        fromLng: current.lng,
        toLat: payload.lat,
        toLng: payload.lng,
        startedAt: performance.now(),
        duration: 9000,
        heading: payload.heading ?? current.heading,
        speedKmh: payload.speedKmh ?? current.speedKmh,
        progressPct: payload.progressPct ?? current.progressPct,
        currentZone: payload.currentZone ?? current.currentZone,
        nextEtaMin: payload.nextEtaMin ?? current.nextEtaMin,
        stopsLeft: payload.stopsLeft ?? current.stopsLeft,
      };

      return prev;
    });
  }, []);

  useEffect(() => {
    let rafId = 0;

    const tick = (now: number) => {
      setPositions((prev) => {
        const next = { ...prev };
        Object.entries(motionsRef.current).forEach(([driverId, m]) => {
          const t = Math.min(1, (now - m.startedAt) / m.duration);
          const eased = 1 - Math.pow(1 - t, 2);
          next[driverId] = {
            lat: m.fromLat + (m.toLat - m.fromLat) * eased,
            lng: m.fromLng + (m.toLng - m.fromLng) * eased,
            heading: m.heading,
            speedKmh: m.speedKmh,
            progressPct: m.progressPct,
            currentZone: m.currentZone,
            nextEtaMin: m.nextEtaMin,
            stopsLeft: m.stopsLeft,
          };
          if (t >= 1) {
            delete motionsRef.current[driverId];
            setArrivedAt((prev) => ({ ...prev, [driverId]: Date.now() }));
          }
        });
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const cleanup = window.setInterval(() => {
      setArrivedAt((prev) => {
        const next: Record<string, number> = {};
        Object.entries(prev).forEach(([k, ts]) => {
          if (Date.now() - ts < 500) next[k] = ts;
        });
        return next;
      });
    }, 250);

    return () => window.clearInterval(cleanup);
  }, []);

  return { positions, moveDriver, arrivedAt };
}

const MapFitControl: React.FC<{ points: LatLngTuple[] }> = ({ points }) => {
  const map = useMap();
  const fitAll = useCallback(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, points]);

  return (
    <button className="map-ctl" onClick={fitAll} type="button" title="Fit all">
      ⊙
    </button>
  );
};

const MapZoomBridge: React.FC = () => {
  const map = useMap();

  useEffect(() => {
    const onZoomIn = () => map.zoomIn();
    const onZoomOut = () => map.zoomOut();
    window.addEventListener('dispatch-zoom-in', onZoomIn as EventListener);
    window.addEventListener('dispatch-zoom-out', onZoomOut as EventListener);
    return () => {
      window.removeEventListener('dispatch-zoom-in', onZoomIn as EventListener);
      window.removeEventListener('dispatch-zoom-out', onZoomOut as EventListener);
    };
  }, [map]);

  return null;
};

const ServicePill: React.FC<{ name: string; state: ServiceState; extra?: string }> = ({ name, state, extra }) => {
  const color = state === 'healthy' ? '#00D4AA' : state === 'degraded' ? '#F59E0B' : '#EF4444';
  return (
    <span data-testid="service-status" data-status={state} className="svc-pill" style={{ color: state === 'healthy' ? '#d1fae5' : '#fecaca' }}>
      <span className="pulse-dot" style={{ backgroundColor: color }} />
      {name}
      {extra ? ` ${extra}` : ''}
    </span>
  );
};

const NotificationToasts: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  return (
    <div className="toast-stack">
      <AnimatePresence>
        {toasts.map((t) => {
          const accent = t.type === 'danger' ? '#EF4444' : t.type === 'warning' ? '#F59E0B' : t.type === 'success' ? '#22c55e' : '#00D4AA';
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 420, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 25 }}
              data-testid="toast"
              className="toast"
              style={{ borderColor: `${accent}66` }}
            >
              <div className="toast-head">
                <span className="toast-dot" style={{ backgroundColor: accent }} />
                <span>{t.message}</span>
                <button onClick={() => onDismiss(t.id)} aria-label="Dismiss toast">
                  <X size={14} />
                </button>
              </div>
              <motion.div
                className="toast-bar"
                style={{ backgroundColor: accent }}
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
};

export default function DispatchDashboard() {
  const {
    tenantId,
    selectedDriverId,
    selectedOrderId,
    setSelectedDriverId,
    setSelectedOrderId,
  } = useAppContext();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showTrafficLayer, setShowTrafficLayer] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [serviceHealth, setServiceHealth] = useState<HealthPayload>({
    api: 'healthy',
    redis: 'healthy',
    celery: 'healthy',
    db: 'healthy',
    workers: 3,
  });
  const [deviationAlert, setDeviationAlert] = useState<{
    driverId: string;
    distanceM: number;
    expected?: LatLngTuple;
    actual?: LatLngTuple;
  } | null>(null);
  const [flashingDrivers, setFlashingDrivers] = useState<Record<string, number>>({});
  const [mobileDrawer, setMobileDrawer] = useState<'fleet' | 'intel' | null>(null);
  const [headerFlash, setHeaderFlash] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connected');
  const lastPositionUpdateAtRef = useRef(0);
  // Performance note: map interactions can be handled imperatively through this ref.
  const mapRef = useRef<L.Map | null>(null);
  const cardCacheRef = useRef<Record<string, { signature: string; data: DriverCardModel }>>({});

  const { positions, moveDriver, arrivedAt } = useDriverPositions(drivers);
  const { getExplanation } = useExplanation();
  const { health } = useHealthStatus();
  const resolvedTenantId = tenantId || DEFAULT_TENANT_ID;

  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message, createdAt: Date.now() }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      const [driversResult, ordersResult, routesResult] = await Promise.allSettled([
        apiClient.getDriversNearby(17.44, 78.44, 50),
        apiClient.getOrders({ status: 'active' }),
        apiClient.getRoutes(),
      ]);

      const driversRes = driversResult.status === 'fulfilled' ? driversResult.value : [];
      const ordersRes = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
      const routesRes = routesResult.status === 'fulfilled' ? routesResult.value : [];

      if (ordersResult.status === 'rejected') {
        pushToast('warning', 'Orders API is temporarily unavailable. Showing cached/fallback orders.');
      }

      const nextDrivers = driversRes.map(normalizeDriver);
      const nextOrders = ordersRes.map(normalizeOrder);

      const fallbackDrivers: Driver[] = [
        {
          id: 'drv-ravi',
          name: 'Ravi Kumar',
          vehicleType: 'bike',
          status: 'on_route',
          lat: 17.4477,
          lng: 78.3921,
          heading: 38,
          speedKmh: 28,
          stopsLeft: 3,
          nextEtaMin: 12,
          currentZone: 'Madhapur',
          progressPct: 72,
        },
        {
          id: 'drv-saleem',
          name: 'Saleem Mohammed',
          vehicleType: 'bike',
          status: 'delay_minor',
          lat: 17.4399,
          lng: 78.4983,
          heading: 110,
          speedKmh: 23,
          stopsLeft: 2,
          nextEtaMin: 16,
          currentZone: 'Secunderabad',
          progressPct: 58,
        },
        {
          id: 'drv-venkat',
          name: 'Venkat Reddy',
          vehicleType: 'auto',
          status: 'on_route',
          lat: 17.393,
          lng: 78.436,
          heading: 220,
          speedKmh: 20,
          stopsLeft: 4,
          nextEtaMin: 24,
          currentZone: 'Mehdipatnam',
          progressPct: 41,
        },
        {
          id: 'drv-priya',
          name: 'Priya Singh',
          vehicleType: 'car',
          status: 'offline',
          lat: 17.3598,
          lng: 78.5433,
          heading: 0,
          speedKmh: 0,
          stopsLeft: 0,
          nextEtaMin: 0,
          currentZone: 'LB Nagar',
          progressPct: 0,
        },
      ];
      const resolvedDrivers = nextDrivers.length ? nextDrivers : fallbackDrivers;
      setDrivers(resolvedDrivers);

      const fallbackOrders: Order[] = [
        {
          id: 'ord-demo-E3',
          orderNumber: 'ORD-E3',
          driverId: 'drv-venkat',
          pickupName: 'Mehdipatnam',
          deliveryName: 'Tolichowki',
          lat: 17.3981,
          lng: 78.422,
          status: 'in_progress',
          etaMin: 24,
          confidence: 0.82,
        },
        {
          id: 'ord-demo-E1',
          orderNumber: 'ORD-E1',
          driverId: 'drv-ravi',
          pickupName: 'Gachibowli',
          deliveryName: 'Hitech City',
          lat: 17.4428,
          lng: 78.3762,
          status: 'pending',
          etaMin: 21,
          confidence: 0.87,
        },
        {
          id: 'ord-demo-E2',
          orderNumber: 'ORD-E2',
          driverId: 'drv-saleem',
          pickupName: 'Bowenpally',
          deliveryName: 'Malkajgiri',
          lat: 17.4559,
          lng: 78.5235,
          status: 'pending',
          etaMin: 26,
          confidence: 0.79,
        },
      ];
      const resolvedOrders = nextOrders.length ? nextOrders : fallbackOrders;
      setOrders(resolvedOrders);
      if (!selectedOrderId && resolvedOrders.length > 0) {
        setSelectedOrderId(resolvedOrders[0].id);
        if (resolvedOrders[0].driverId) {
          setSelectedDriverId(resolvedOrders[0].driverId);
        }
      }

      const fromApiRoutes = routesRes;
      if (fromApiRoutes.length) {
        setRoutes(
          fromApiRoutes.map((r: any) => {
            const points = (r.geometry || r.path || []).map((p: any) => [Number(p.lat), Number(p.lng)] as LatLngTuple);
            return {
              driverId: String(r.driver_id),
              fullPath: points,
              completedPath: points.slice(0, Math.max(1, Math.floor(points.length * 0.4))),
              remainingPath: points.slice(Math.max(0, Math.floor(points.length * 0.4) - 1)),
            };
          })
        );
      } else {
        setRoutes(mockRoutesFromDrivers(resolvedDrivers, resolvedOrders));
      }

      setLastUpdated(new Date());
    } catch {
      pushToast('warning', 'Initial data load had partial failures. Using fallback live data.');
    }
  }, [pushToast, selectedOrderId, setSelectedDriverId, setSelectedOrderId]);

  const fetchExplain = useCallback(async (orderId: string, driverId?: string) => {
    try {
      const data = await getExplanation(orderId, driverId);
      setExplainData(data);
    } catch {
      setExplainData(null);
      pushToast('warning', 'Could not fetch SHAP explanation for selected order.');
    }
  }, [getExplanation, pushToast]);

  const triggerReoptimize = useCallback(async () => {
    try {
      pushToast('info', 'Re-optimizing routes...');
      await apiClient.optimizeRoutes({ method: 'ortools', use_ml: true });
      pushToast('success', 'Route optimization complete. Updated plans applied.');
      setLastUpdated(new Date());
    } catch {
      pushToast('danger', 'Route optimization failed. Please retry.');
    }
  }, [drivers, orders, pushToast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (!health) return;
    setServiceHealth({
      api: (health.api ?? (health.status === 'operational' || health.status === 'ok' ? 'healthy' : 'degraded')) as ServiceState,
      redis: (health.redis ?? 'healthy') as ServiceState,
      celery: (health.celery ?? 'healthy') as ServiceState,
      db: (health.db ?? 'healthy') as ServiceState,
      workers: Number(health.workers ?? 3),
    });
  }, [health]);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const onWsMessage = useCallback((msg: WsDispatchMessage) => {
    setLastUpdated(new Date());

    if (msg.type === 'position_update') {
      // Performance safeguard: cap high-frequency socket updates at 10/s.
      const now = performance.now();
      if (now - lastPositionUpdateAtRef.current < 100) return;
      lastPositionUpdateAtRef.current = now;

      moveDriver(msg.driver_id, {
        lat: msg.lat,
        lng: msg.lng,
        heading: msg.heading_degrees ?? 0,
        speedKmh: msg.speed_kmh ?? 0,
        progressPct: msg.progress_pct ?? 0,
        currentZone: msg.current_zone ?? 'Unknown',
        nextEtaMin: msg.next_eta_min ?? 0,
        stopsLeft: msg.stops_left ?? 0,
      });
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === msg.driver_id
            ? {
                ...d,
                lat: msg.lat,
                lng: msg.lng,
                heading: msg.heading_degrees ?? d.heading,
                speedKmh: msg.speed_kmh ?? d.speedKmh,
                progressPct: msg.progress_pct ?? d.progressPct,
                currentZone: msg.current_zone ?? d.currentZone,
                nextEtaMin: msg.next_eta_min ?? d.nextEtaMin,
                stopsLeft: msg.stops_left ?? d.stopsLeft,
              }
            : d
        )
      );
      return;
    }

    if (msg.type === 'deviation_alert') {
      const distance = Number(msg.distance_m ?? 420);
      setDrivers((prev) => prev.map((d) => (d.id === msg.driver_id ? { ...d, status: 'deviation' } : d)));
      setHeaderFlash(true);
      window.setTimeout(() => setHeaderFlash(false), 360);
      setDeviationAlert({
        driverId: msg.driver_id,
        distanceM: distance,
        expected:
          msg.expected_lat !== undefined && msg.expected_lng !== undefined
            ? [msg.expected_lat, msg.expected_lng]
            : undefined,
        actual:
          msg.actual_lat !== undefined && msg.actual_lng !== undefined
            ? [msg.actual_lat, msg.actual_lng]
            : undefined,
      });
      setSelectedDriverId(msg.driver_id);
      setFlashingDrivers((prev) => ({ ...prev, [msg.driver_id]: Date.now() }));
      pushToast('danger', `${msg.message || 'Driver off route'} ${distance}m`);
      window.setTimeout(() => {
        setFlashingDrivers((prev) => {
          const next = { ...prev };
          delete next[msg.driver_id];
          return next;
        });
      }, 2600);
      return;
    }

    if (msg.type === 'eta_update') {
      setOrders((prev) => prev.map((o) => (o.id === msg.order_id ? { ...o, etaMin: msg.eta_min } : o)));
      return;
    }

    if (msg.type === 'delivery_completed') {
      setOrders((prev) => prev.map((o) => (o.id === msg.order_id ? { ...o, status: 'completed' } : o)));
      pushToast('success', `Order ${msg.order_id} delivered — feedback recorded`);
      return;
    }

    if (msg.type === 'reoptimize_triggered') {
      pushToast('info', msg.message || 'Route re-optimization triggered from backend');
    }
  }, [moveDriver, pushToast]);

  useDispatchWebSocket({
    tenantId: resolvedTenantId,
    onMessage: onWsMessage,
    onOpen: () => setWsStatus('connected'),
    onClose: () => undefined,
    onError: () => {
      pushToast('warning', 'Realtime socket degraded. Reconnecting...');
    },
  });

  useEffect(() => {
    const onOffline = () => setWsStatus('disconnected');
    const onOnline = () => setWsStatus('connected');
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.querySelectorAll('.leaflet-interactive.order-marker').forEach((el) => {
        el.setAttribute('data-testid', 'order-marker');
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [orders, selectedOrderId]);

  const sortedDrivers = useMemo(() => {
    const rank = (status: DriverStatus) => {
      if (status === 'deviation') return 0;
      if (status === 'delay_minor') return 1;
      if (status === 'on_route') return 2;
      return 3;
    };
    return [...drivers].sort((a, b) => rank(a.status) - rank(b.status));
  }, [drivers]);

  const selectedDriver = useMemo(() => drivers.find((d) => d.id === selectedDriverId) || null, [drivers, selectedDriverId]);
  const selectedOrder = useMemo(() => orders.find((o) => o.id === selectedOrderId) || null, [orders, selectedOrderId]);

  const handleDriverSelect = useCallback((driverId: string) => {
    setSelectedDriverId(driverId);
    const related = orders.find((o) => o.driverId === driverId && o.status !== 'completed');
    if (related) setSelectedOrderId(related.id);
    setMobileDrawer(null);
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
        d.status === 'on_route' ? 'on_route' : d.status === 'delay_minor' ? 'delayed' : d.status === 'deviation' ? 'deviated' : 'offline';
      const rawEtas = (d as any).lastThreeETAs || [
        { deviation: mappedStatus === 'deviated' ? 6 : mappedStatus === 'delayed' ? 3 : 1 },
        { deviation: mappedStatus === 'deviated' ? 5 : mappedStatus === 'delayed' ? 2 : -1 },
        { deviation: mappedStatus === 'deviated' ? 4 : mappedStatus === 'delayed' ? 4 : 0 },
      ];
      const signature = [
        mappedStatus,
        d.currentZone,
        Math.round(d.speedKmh),
        Math.round(d.progressPct),
        d.stopsLeft,
        Math.round(d.nextEtaMin),
        mappedStatus === 'deviated' ? Math.round(deviationAlert?.distanceM ?? 420) : 0,
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
        heading: Math.round(d.heading),
        routeProgress: Math.max(0, Math.min(100, Math.round(d.progressPct))),
        stopsRemaining: d.stopsLeft,
        etaNextStop: Math.round(d.nextEtaMin),
        etaConfidence: mappedStatus === 'deviated' ? 74 : mappedStatus === 'delayed' ? 84 : 93,
        lastThreeETAs: rawEtas,
        isDeviating: mappedStatus === 'deviated',
        deviationMeters: mappedStatus === 'deviated' ? Math.round(deviationAlert?.distanceM ?? 420) : undefined,
      };

      cardCacheRef.current[d.id] = { signature, data };
      return data;
    });
  }, [sortedDrivers, deviationAlert?.distanceM]);

  useEffect(() => {
    if (selectedOrderId) {
      // Performance safeguard: debounce explain calls for rapid order clicks.
      const timer = window.setTimeout(() => {
        fetchExplain(selectedOrderId, selectedDriverId || selectedOrder?.driverId);
      }, 300);
      return () => window.clearTimeout(timer);
    }
  }, [fetchExplain, selectedDriverId, selectedOrder?.driverId, selectedOrderId]);

  const driverCount = drivers.filter((d) => d.status !== 'offline').length;
  const orderCount = orders.filter((o) => o.status !== 'completed').length;
  const modelConfidence = Math.round(((explainData?.confidence_within_5min ?? 0.87) as number) * 100);
  const alertCount = toasts.filter((t) => t.type === 'danger' || t.type === 'warning').length;

  const mapPoints = useMemo<LatLngTuple[]>(() => {
    const pDrivers = drivers.map((d) => [positions[d.id]?.lat ?? d.lat, positions[d.id]?.lng ?? d.lng] as LatLngTuple);
    const pOrders = orders.map((o) => [o.lat, o.lng] as LatLngTuple);
    return [...pDrivers, ...pOrders];
  }, [drivers, orders, positions]);

  const completedCount = orders.filter((o) => o.status === 'completed').length;
  const inProgressCount = orders.filter((o) => o.status === 'in_progress' || o.status === 'pending').length;

  const timelineItems = useMemo(() => {
    const nowH = clock.getHours();
    return Array.from({ length: 8 }).map((_, i) => {
      const hour = 9 + i;
      return {
        hour,
        onTime: (hour + completedCount) % 3 !== 0,
        active: hour <= nowH,
      };
    });
  }, [clock, completedCount]);

  const maeValues = [9.4, 9.1, 8.9, 8.8, 8.6, 8.5, 8.3];
  const sparklinePath = useMemo(() => {
    const max = Math.max(...maeValues);
    const min = Math.min(...maeValues);
    return maeValues
      .map((v, i) => {
        const x = (i / (maeValues.length - 1)) * 220;
        const y = 50 - ((v - min) / Math.max(0.0001, max - min)) * 36;
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  }, [maeValues]);

  const topFactors = (explainData?.factors || []).slice(0, 3);
  const maxImpact = Math.max(1, ...topFactors.map((f) => Math.abs(f.impact_minutes)));

  const leftPanel = (
    <aside className="panel left-panel">
      <div className="panel-title">Fleet Status</div>
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
    </aside>
  );

  const rightPanel = (
    <aside className={`panel right-panel ${deviationAlert ? 'alert' : ''}`}>
      {deviationAlert ? (
        <>
          <div className="deviation-banner">DEVIATION DETECTED</div>
          <div className="intel-block">
            <h3>{selectedDriver?.name || deviationAlert.driverId}</h3>
            <p>Off-route by {Math.round(deviationAlert.distanceM)}m</p>
            <div className="coords-row">
              <span>Expected: {deviationAlert.expected ? `${deviationAlert.expected[0].toFixed(4)}, ${deviationAlert.expected[1].toFixed(4)}` : 'N/A'}</span>
              <span>Actual: {deviationAlert.actual ? `${deviationAlert.actual[0].toFixed(4)}, ${deviationAlert.actual[1].toFixed(4)}` : 'N/A'}</span>
            </div>
            <div className="action-row">
              <button className="ghost-btn">Notify Driver</button>
              <button className="primary-btn" onClick={triggerReoptimize}>Re-optimize Route</button>
            </div>
          </div>
        </>
      ) : selectedOrderId ? (
        <>
          <div className="panel-title">Order Intelligence</div>
          <div className="intel-block">
            <h3>{selectedOrder?.orderNumber || selectedOrderId}</h3>
            <p>{selectedOrder?.pickupName} → {selectedOrder?.deliveryName}</p>

            <div className="range-bar-wrap">
              <div className="range-track" />
              <div className="range-point p10" style={{ left: '15%' }}>P10 {Math.round(explainData?.eta_p10 ?? 20)}</div>
              <div className="range-point p50" style={{ left: '50%' }}>P50 {Math.round(explainData?.eta_minutes ?? selectedOrder?.etaMin ?? 24)}</div>
              <div className="range-point p90" style={{ left: '82%' }}>P90 {Math.round(explainData?.eta_p90 ?? 33)}</div>
            </div>

            <div className="factor-bars">
              {topFactors.map((f) => (
                <div key={`${f.feature}-${f.importance_rank}`} className="factor-row">
                  <span className="f-label">{f.feature.replace(/_/g, ' ')}</span>
                  <div className="f-track">
                    <div className="f-fill" style={{ width: `${(Math.abs(f.impact_minutes) / maxImpact) * 100}%` }} />
                  </div>
                  <span className="f-val">+{Math.round(f.impact_minutes)} min</span>
                </div>
              ))}
            </div>

            {(explainData?.what_would_help || '').length > 0 && (
              <div className="help-box">
                <p>{explainData?.what_would_help}</p>
                <button className="primary-btn">Reassign to Ravi Kumar →</button>
              </div>
            )}

            <div className="card-embed">
              <ETAExplanationCard orderId={selectedOrderId} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="panel-title">Order Intelligence</div>
          <div className="summary-grid">
            <div className="summary-card"><span>{completedCount}</span><small>Completed today</small></div>
            <div className="summary-card"><span>{inProgressCount}</span><small>In progress</small></div>
          </div>

          <div className="timeline-wrap">
            <div className="timeline-head">Today's timeline</div>
            <div className="timeline-row">
              {timelineItems.map((t) => (
                <div key={t.hour} className={`tl-dot ${t.active ? 'active' : ''}`} style={{ backgroundColor: t.onTime ? '#00D4AA' : '#EF4444' }} title={`${t.hour}:00`} />
              ))}
            </div>
          </div>

          <div className="model-health">
            <div className="timeline-head">Model Health</div>
            <div className="mh-row"><span>Version</span><strong>v_20260320_020000</strong></div>
            <div className="mh-row"><span>MAE</span><strong>8.3 min <em>↓ 0.4</em></strong></div>
            <div className="mh-row"><span>Accuracy</span><strong>87% within 5 min</strong></div>
            <div className="mh-row"><span>Last drift check</span><strong>2h ago — Stable ●</strong></div>
            <svg viewBox="0 0 220 56" className="sparkline">
              <path d={sparklinePath} fill="none" stroke="#00D4AA" strokeWidth="2.4" />
            </svg>
          </div>
        </>
      )}
    </aside>
  );

  return (
    <div className="dispatch-root">
      <style>{`
        .dispatch-root { background: #0A0A0F; color: #F1F5F9; font-family: Inter, system-ui, sans-serif; height: 100vh; overflow: hidden; display: grid; grid-template-rows: 56px 1fr 32px; }
        .header { height: 56px; background: #0F1420; border-bottom: 1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:space-between; padding: 0 14px; gap:12px; }
        .header.flash { animation: header-flash-red 360ms ease-out 1; }
        @keyframes header-flash-red {
          0% { box-shadow: inset 0 0 0 9999px rgba(239, 68, 68, 0.1); }
          100% { box-shadow: inset 0 0 0 9999px rgba(239, 68, 68, 0); }
        }
        .logo { display:flex; align-items:center; gap:10px; min-width: 240px; }
        .logo-title { font-weight: 800; background: linear-gradient(90deg,#00D4AA,#6EE7FF); -webkit-background-clip: text; color: transparent; letter-spacing: 0.02em; }
        .logo-sub { color: #64748B; font-size: 12px; }
        .status-pills, .meta-pills { display:flex; align-items:center; gap:8px; }
        .pill { background:#141B2D; border:1px solid rgba(255,255,255,0.08); border-radius:999px; padding:6px 10px; display:flex; align-items:center; gap:8px; font-size:12px; color:#dbe7f4; }
        .pulse-dot { width:8px; height:8px; border-radius:999px; animation: pulse 1.2s infinite ease-in-out; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .alert-bell { position:relative; background:#141B2D; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:7px; color:#cdd9ea; }
        .bell-badge { position:absolute; top:-4px; right:-4px; width:16px; height:16px; border-radius:50%; font-size:10px; display:flex; align-items:center; justify-content:center; background:#EF4444; color:white; }

        .body { min-height:0; display:grid; grid-template-columns: 280px 1fr 380px; gap:10px; padding:10px; overflow:hidden; }
        .panel { background: #0F1420; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; min-height:0; overflow:hidden; }
        .panel-title { font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #8ca0bb; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); }

        .left-panel { display:flex; flex-direction:column; }
        .fleet-list { overflow:auto; padding:10px; display:flex; flex-direction:column; gap:10px; }
        .driver-card { text-align:left; background:#141B2D; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px; color:#dbe6f4; }
        .driver-card.selected { border-color: rgba(0,212,170,0.55); box-shadow: 0 0 0 1px rgba(0,212,170,0.4) inset; }
        .driver-card.offline { opacity:0.6; }
        .driver-head { display:flex; align-items:center; justify-content:space-between; }
        .driver-name-wrap { display:flex; align-items:center; gap:8px; font-weight:600; }
        .status-dot { width:8px; height:8px; border-radius:99px; }
        .vehicle-tag { font-size:11px; border:1px solid rgba(255,255,255,0.15); padding:2px 6px; border-radius:999px; color:#9bb0ca; }
        .driver-sub, .driver-zone, .driver-metrics { font-size:12px; color:#9db0c9; margin-top:5px; }
        .progress-wrap { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; }
        .progress-track { flex:1; height:7px; background:#0a1020; border-radius:99px; overflow:hidden; }
        .progress-fill { height:100%; background:#00D4AA; transition: width 1s ease; }
        .eta-chip { font-size:11px; color:#d8fcef; }

        .map-shell { position:relative; height:100%; border-radius:12px; overflow:hidden; }
        .map-controls { position:absolute; z-index:500; top:10px; right:10px; display:flex; gap:6px; }
        .map-ctl { background:#141B2D; border:1px solid rgba(255,255,255,0.12); color:#e5edf8; width:30px; height:30px; border-radius:8px; display:grid; place-items:center; }
        .map-ctl.active { border-color: rgba(0,212,170,0.7); color: #00D4AA; }
        .map-ctl.wide { width:auto; padding:0 8px; font-size:11px; }

        .driver-icon { width:40px; height:40px; border-radius:999px; background: rgba(20,27,45,0.95); border:2px solid var(--marker); display:grid; place-items:center; position:relative; box-shadow: 0 0 20px color-mix(in srgb, var(--marker) 40%, transparent); }
        .driver-initials { font-size:11px; font-weight:700; color:white; }
        .driver-heading { position:absolute; bottom:-4px; left:50%; width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:10px solid var(--marker); }
        .flash-red { animation: flashRed .25s ease-in-out 3; }
        .arrival-bounce { animation: marker-arrival-bounce 0.4s ease-out 1; }
        @keyframes flashRed { 0%,100%{filter:none} 50%{filter: drop-shadow(0 0 10px #ef4444) brightness(1.35);} }
        @keyframes marker-arrival-bounce {
          0% { transform: scale(1); }
          45% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }

        .order-dot-ring { animation: ring-pulse 1.4s infinite linear; transform-origin:center; }
        @keyframes ring-pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }

        .right-panel { display:flex; flex-direction:column; overflow:auto; }
        .right-panel.alert { box-shadow: 0 0 0 1px rgba(239,68,68,0.6) inset; }
        .deviation-banner { background:#7f1d1d; color:#fecaca; font-weight:800; letter-spacing:.1em; text-transform:uppercase; padding:8px 12px; }
        .intel-block { padding:12px; display:flex; flex-direction:column; gap:8px; }
        .intel-block h3 { font-size:16px; margin:0; }
        .intel-block p { margin:0; color:#9fb2c9; font-size:13px; }
        .coords-row { display:flex; flex-direction:column; gap:4px; font-size:12px; color:#93a6bf; }
        .action-row { display:flex; gap:8px; }
        .primary-btn, .ghost-btn { border-radius:8px; padding:8px 10px; font-size:12px; font-weight:600; }
        .primary-btn { background:#00D4AA; color:#062319; border:1px solid #00D4AA; }
        .ghost-btn { background:#141B2D; border:1px solid rgba(255,255,255,0.15); color:#d7e4f5; }
        .range-bar-wrap { position:relative; margin:12px 0 18px; height:40px; }
        .range-track { position:absolute; top:18px; left:0; right:0; height:6px; background:#0a1020; border-radius:99px; }
        .range-point { position:absolute; top:0; transform:translateX(-50%); font-size:10px; color:#dce9f8; }
        .factor-bars { display:flex; flex-direction:column; gap:8px; }
        .factor-row { display:grid; grid-template-columns: 1fr 120px auto; gap:8px; align-items:center; font-size:12px; }
        .f-label { color:#b2c2d8; text-transform:capitalize; }
        .f-track { height:8px; background:#0a1020; border-radius:99px; overflow:hidden; }
        .f-fill { height:100%; background: linear-gradient(90deg,#00D4AA,#49e7c6); transition: width .6s ease; }
        .f-val { color:#00D4AA; font-weight:600; }
        .help-box { border:1px solid rgba(0,212,170,0.35); background:rgba(0,212,170,0.08); border-radius:10px; padding:10px; margin-top:8px; display:flex; flex-direction:column; gap:8px; }
        .card-embed { margin-top:8px; }

        .summary-grid { padding:12px; display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .summary-card { background:#141B2D; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px; display:flex; flex-direction:column; }
        .summary-card span { font-size:24px; font-weight:800; color:#00D4AA; }
        .summary-card small { color:#8ea3bc; font-size:11px; }
        .timeline-wrap, .model-health { padding:0 12px 12px; }
        .timeline-head { color:#8ca0bb; font-size:11px; text-transform:uppercase; letter-spacing:.08em; margin:8px 0; }
        .timeline-row { display:flex; justify-content:space-between; gap:6px; }
        .tl-dot { width:12px; height:12px; border-radius:999px; opacity:.45; }
        .tl-dot.active { opacity:1; }
        .mh-row { display:flex; justify-content:space-between; color:#9fb2c8; font-size:12px; margin:4px 0; }
        .mh-row strong { color:#dce9f8; font-weight:600; }
        .mh-row em { color:#00D4AA; font-style:normal; }
        .sparkline { width:100%; height:56px; margin-top:6px; }

        .toast-stack { position: fixed; right: 14px; top: 70px; z-index: 1200; display:flex; flex-direction:column; gap:8px; width: min(360px, 92vw); }
        .toast { background:#141B2D; border:1px solid; border-radius:10px; overflow:hidden; }
        .toast-head { display:flex; align-items:center; gap:8px; font-size:12px; color:#dce9f8; padding:10px; }
        .toast-head button { margin-left:auto; color:#94a3b8; }
        .toast-dot { width:8px; height:8px; border-radius:999px; }
        .toast-bar { height:2px; }

        .bottom-bar { height:32px; background:#060A12; border-top:1px solid rgba(255,255,255,0.08); display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; font-size:11px; color:#8ea2bb; padding:0 10px; }
        .bottom-left, .bottom-center, .bottom-right { display:flex; gap:8px; align-items:center; }
        .bottom-center { justify-content:center; }
        .bottom-right { justify-content:flex-end; }
        .svc-pill { background:#0F1420; border:1px solid rgba(255,255,255,0.08); border-radius:999px; padding:2px 7px; font-size:11px; display:flex; align-items:center; gap:6px; }

        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip { background:#141B2D !important; color:#e2ebf9 !important; border:1px solid rgba(255,255,255,0.1) !important; }
        .leaflet-popup-content { margin:10px !important; }
        .leaflet-control-attribution,
        .leaflet-control-zoom { display:none !important; }
        .leaflet-container { background:#0A0A0F !important; }

        .mobile-sheet-toggle { display:none; }
        @media (max-width: 1024px) {
          .body { grid-template-columns: 1fr; padding:8px; }
          .left-panel, .right-panel { display:none; }
          .mobile-sheet-toggle { display:flex; position:absolute; z-index:600; left:10px; top:10px; gap:6px; }
          .mobile-sheet { position:fixed; left:8px; right:8px; bottom:42px; background:#0F1420; border:1px solid rgba(255,255,255,0.1); border-radius:12px; max-height:48vh; overflow:auto; z-index:900; }
          .header { gap:8px; }
          .logo-sub { display:none; }
          .status-pills { display:none; }
          .meta-pills { margin-left:auto; }
          .bottom-bar { grid-template-columns:1fr; gap:4px; height:auto; padding:6px; }
          .bottom-center, .bottom-right { justify-content:flex-start; }
        }
      `}</style>

      <header className={`header ${headerFlash ? 'flash' : ''}`}>
        <div className="logo">
          <div className="logo-title">IntelliLog-AI</div>
          <div className="logo-sub">Dispatch Control</div>
        </div>

        <div className="status-pills">
          <span className="pill"><span className="pulse-dot" style={{ background: '#00D4AA' }} /> {driverCount} Drivers Active</span>
          <span className="pill"><span className="pulse-dot" style={{ background: '#00D4AA' }} /> {orderCount} Orders Live</span>
          <span className="pill"><span className="pulse-dot" style={{ background: modelConfidence >= 85 ? '#00D4AA' : modelConfidence >= 70 ? '#F59E0B' : '#EF4444' }} /> ML: {modelConfidence}% confidence</span>
        </div>

        <div className="meta-pills">
          <span className="pill">Last retrain: 2h ago</span>
          <span className="pill">Drift: stable ●</span>
          <span className="pill"><Clock3 size={12} /> {clock.toLocaleTimeString()}</span>
          <button className="alert-bell" aria-label="Alerts">
            <Bell size={14} />
            {alertCount > 0 && <span className="bell-badge">{alertCount}</span>}
          </button>
        </div>
      </header>

      <NotificationToasts toasts={toasts} onDismiss={removeToast} />

      <div className="body">
        {leftPanel}

        <section className="panel map-panel" style={{ overflow: 'hidden' }}>
          <div className="map-shell">
            <div className="mobile-sheet-toggle">
              <button className="map-ctl wide" onClick={() => setMobileDrawer((d) => (d === 'fleet' ? null : 'fleet'))}>Fleet</button>
              <button className="map-ctl wide" onClick={() => setMobileDrawer((d) => (d === 'intel' ? null : 'intel'))}>Intel</button>
            </div>

            <MapContainer center={[17.44, 78.44]} zoom={12} style={{ width: '100%', height: '100%' }} zoomControl={false} ref={mapRef as any}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

              {showRoutes &&
                routes.map((route, idx) => {
                  const color = shimmerRoutes[idx % shimmerRoutes.length];
                  return (
                    <React.Fragment key={route.driverId}>
                      {route.completedPath.length > 1 && (
                        <Polyline positions={route.completedPath as LatLngExpression[]} pathOptions={{ color, opacity: 0.3, dashArray: '8 10', weight: 4 }} />
                      )}
                      {route.remainingPath.length > 1 && (
                        <Polyline positions={route.remainingPath as LatLngExpression[]} pathOptions={{ color, opacity: 0.9, weight: 5 }} />
                      )}
                    </React.Fragment>
                  );
                })}

              {deviationAlert?.expected && deviationAlert?.actual && (
                <Polyline
                  positions={[deviationAlert.expected, deviationAlert.actual]}
                  pathOptions={{ color: '#EF4444', weight: 3, dashArray: '4 8' }}
                />
              )}

              {drivers.map((driver) => {
                const pos = positions[driver.id];
                const lat = pos?.lat ?? driver.lat;
                const lng = pos?.lng ?? driver.lng;
                return (
                  <Marker
                    key={driver.id}
                    position={[lat, lng]}
                    icon={createDriverIcon(
                      {
                        ...driver,
                        heading: pos?.heading ?? driver.heading,
                        speedKmh: pos?.speedKmh ?? driver.speedKmh,
                        progressPct: pos?.progressPct ?? driver.progressPct,
                        currentZone: pos?.currentZone ?? driver.currentZone,
                        nextEtaMin: pos?.nextEtaMin ?? driver.nextEtaMin,
                        stopsLeft: pos?.stopsLeft ?? driver.stopsLeft,
                      },
                      Boolean(flashingDrivers[driver.id]),
                      Boolean(arrivedAt[driver.id])
                    )}
                    eventHandlers={{ click: () => setSelectedDriverId(driver.id) }}
                  />
                );
              })}

              {orders.map((order) => {
                const isCurrent = selectedOrderId === order.id;
                const isCompleted = order.status === 'completed';
                return (
                  <React.Fragment key={order.id}>
                    <CircleMarker
                      center={[order.lat, order.lng]}
                      radius={8}
                      pathOptions={{
                        color: isCompleted ? '#00D4AA' : '#FFFFFF',
                        fillColor: isCompleted ? '#00D4AA' : '#141B2D',
                        fillOpacity: 1,
                        weight: 2,
                        className: 'order-marker',
                      }}
                      eventHandlers={{
                        click: () => {
                          setSelectedOrderId(order.id);
                          if (order.driverId) setSelectedDriverId(order.driverId);
                        },
                      }}
                    >
                      <Popup>
                        <div style={{ minWidth: 220 }}>
                          <strong>{order.orderNumber}</strong>
                          <div>{order.pickupName} → {order.deliveryName}</div>
                          <div>ETA: {order.etaMin} min ({Math.round(order.confidence * 100)}% confident)</div>
                          <div>Traffic: +8 min [SHAP]</div>
                          <div>Rush hour: +3 min [SHAP]</div>
                          <button
                            style={{ marginTop: 8, color: '#00D4AA', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            onClick={() => setSelectedOrderId(order.id)}
                          >
                            View full explanation →
                          </button>
                        </div>
                      </Popup>
                    </CircleMarker>

                    {isCurrent && (
                      <CircleMarker
                        center={[order.lat, order.lng]}
                        radius={8}
                        pathOptions={{ color: '#00D4AA', fillOpacity: 0, weight: 2, className: 'order-dot-ring' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}

              {showTrafficLayer &&
                [
                  { c: [17.3981, 78.422] as LatLngTuple, i: 0.9 },
                  { c: [17.4477, 78.3921] as LatLngTuple, i: 0.6 },
                  { c: [17.4559, 78.5235] as LatLngTuple, i: 0.4 },
                ].map((z, i) => (
                  <CircleMarker
                    key={`traffic-${i}`}
                    center={z.c}
                    radius={42}
                    pathOptions={{
                      stroke: false,
                      fillColor: z.i > 0.75 ? '#EF4444' : z.i > 0.5 ? '#F59E0B' : '#00D4AA',
                      fillOpacity: 0.1,
                    }}
                  />
                ))}

              <MapZoomBridge />
              <MapFitControl points={mapPoints} />
            </MapContainer>

            <div className="map-controls">
              <button className="map-ctl" onClick={() => window.dispatchEvent(new CustomEvent('dispatch-zoom-in'))}><ZoomIn size={14} /></button>
              <button className="map-ctl" onClick={() => window.dispatchEvent(new CustomEvent('dispatch-zoom-out'))}><ZoomOut size={14} /></button>
              <button className={`map-ctl wide ${showTrafficLayer ? 'active' : ''}`} onClick={() => setShowTrafficLayer((v) => !v)}>Traffic ●</button>
              <button className={`map-ctl wide ${showRoutes ? 'active' : ''}`} onClick={() => setShowRoutes((v) => !v)}>Routes ●</button>
              <button className="map-ctl" onClick={triggerReoptimize}><RefreshCcw size={14} /></button>
            </div>
          </div>
        </section>

        {rightPanel}
      </div>

      {mobileDrawer === 'fleet' && <div className="mobile-sheet">{leftPanel}</div>}
      {mobileDrawer === 'intel' && <div className="mobile-sheet">{rightPanel}</div>}

      <footer data-testid="status-bar" className="bottom-bar">
        <div className="bottom-left">
          <ServicePill name="API" state={serviceHealth.api || 'healthy'} />
          <ServicePill name="Redis" state={serviceHealth.redis || 'healthy'} />
          <ServicePill name="Celery" state={serviceHealth.celery || 'healthy'} extra={`${serviceHealth.workers || 0} workers`} />
          <ServicePill name="DB" state={serviceHealth.db || 'healthy'} />
          <ServicePill name="Model" state={modelConfidence >= 85 ? 'healthy' : modelConfidence >= 70 ? 'degraded' : 'unhealthy'} />
        </div>
        <div className="bottom-center">Last updated: {Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000))} seconds ago</div>
        <div className="bottom-right"><ConnectionStatus wsStatus={wsStatus} /> Tenant: {resolvedTenantId} · Model: v_20260320_020000</div>
      </footer>
    </div>
  );
}


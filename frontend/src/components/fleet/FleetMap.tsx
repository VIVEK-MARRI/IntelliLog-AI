import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import clsx from 'clsx'
import {
  Crosshair,
  EyeSlash,
  MagnifyingGlass,
  MapTrifold,
  TrafficSign,
  Truck,
  Warning,
  X,
} from '@phosphor-icons/react'
import { syntheticPosition } from '@/api/orders'
import { useOrdersArray } from '@/store/fleetStore'
import type { LiveOrder, Stop } from '@/types/api'
import { buildClusters, type ClusterState } from './MarkerCluster'

interface FleetMapProps {
  onOrderSelect?: (orderId: string) => void
  selectedOrderId?: string | null
}

interface DriverMarker {
  marker: L.Marker
  ring: L.CircleMarker
  order: LiveOrder
  visible: boolean
}

interface RouteGeometry {
  points: [number, number][]
  cumulativeMeters: number[]
  totalMeters: number
  durationSeconds: number
  stopIndices: number[]
  source: 'osrm' | 'fallback'
}

interface RouteVisual {
  halo?: L.Polyline
  completed?: L.Polyline
  remaining?: L.Polyline
}

interface VehicleRuntime {
  progressMeters: number
  speedMps: number
  lastFrame: number
  bearing: number
}

interface LayerState {
  traffic: boolean
  route: boolean
  risk: boolean
  driver: boolean
}

type FilterKey = 'all' | 'active' | 'delayed' | 'highRisk' | 'optimized'

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795]
const DEFAULT_ZOOM = 4
const ZOOM_THRESHOLD = 9
const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving'

const COLORS = {
  charcoal: '#111315',
  onSchedule: '#27C281',
  atRisk: '#F4C542',
  critical: '#EF4444',
  selected: '#2563EB',
  normalRoute: '#94A3B8',
  completedRoute: '#27C281',
  selectedRoute: '#F4C542',
  freeTraffic: '#27C281',
  moderateTraffic: '#F4C542',
  heavyTraffic: '#EF4444',
}

function getCoordinates(order: LiveOrder): [number, number] {
  const candidates: Array<[number | undefined | null, number | undefined | null]> = [
    [order.current_position?.lat, order.current_position?.lng],
    [(order as any).latitude, (order as any).longitude],
    [(order as any).lat, (order as any).lng],
    [(order as any).current_location?.lat, (order as any).current_location?.lng],
    [(order as any).origin_lat, (order as any).origin_lng],
  ]

  for (const [lat, lng] of candidates) {
    const nlat = Number(lat)
    const nlng = Number(lng)
    if (Number.isFinite(nlat) && Number.isFinite(nlng) && (nlat !== 0 || nlng !== 0)) {
      return [nlat, nlng]
    }
  }

  const fallback = syntheticPosition(order.id)
  return [fallback.lat, fallback.lng]
}

function getDestination(order: LiveOrder): [number, number] | null {
  const lat = Number(order.destination_lat)
  const lng = Number(order.destination_lng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) return [lat, lng]
  const lastStop = order.stops?.[order.stops.length - 1]
  if (lastStop && Number.isFinite(lastStop.lat) && Number.isFinite(lastStop.lng)) return [lastStop.lat, lastStop.lng]
  return null
}

function routeWaypoints(order: LiveOrder): [number, number][] {
  const points: [number, number][] = []
  if (Number.isFinite(order.origin_lat) && Number.isFinite(order.origin_lng) && (order.origin_lat !== 0 || order.origin_lng !== 0)) {
    points.push([order.origin_lat, order.origin_lng])
  }

  if (order.stops?.length) {
    order.stops
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
      .sort((a, b) => a.sequence - b.sequence)
      .forEach((stop) => points.push([stop.lat, stop.lng]))
  }

  const destination = getDestination(order)
  if (destination) points.push(destination)

  if (points.length < 2) {
    points.unshift(getCoordinates(order))
  }

  return dedupePoints(points).slice(0, 24)
}

function dedupePoints(points: [number, number][]): [number, number][] {
  const result: [number, number][] = []
  points.forEach((point) => {
    const previous = result[result.length - 1]
    if (!previous || L.latLng(previous).distanceTo(point) > 15) result.push(point)
  })
  return result
}

function statusFor(order: LiveOrder): 'onSchedule' | 'atRisk' | 'critical' {
  if (order.risk_score >= 0.7 || order.delay_minutes >= 20) return 'critical'
  if (order.risk_score >= 0.3 || order.delay_minutes > 0) return 'atRisk'
  return 'onSchedule'
}

function statusColor(order: LiveOrder, selected = false): string {
  if (selected) return COLORS.selected
  return COLORS[statusFor(order)]
}

function routeStateColor(order: LiveOrder, selected = false): string {
  if (selected) return COLORS.selectedRoute
  if (statusFor(order) === 'critical') return COLORS.critical
  if (statusFor(order) === 'atRisk') return COLORS.atRisk
  return COLORS.onSchedule
}

function formatId(id: string): string {
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase()
}

function driverInitials(order: LiveOrder): string {
  const source = order.driver_name || order.driver_id || order.id
  const parts = source.replace(/[-_]/g, ' ').split(' ').filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function bearingBetween(from: [number, number], to: [number, number]): number {
  const lat1 = from[0] * Math.PI / 180
  const lat2 = to[0] * Math.PI / 180
  const lngDelta = (to[1] - from[1]) * Math.PI / 180
  const y = Math.sin(lngDelta) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lngDelta)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function vehicleIcon(order: LiveOrder, selected: boolean, bearing: number, remainingMeters: number, etaMinutes: number): L.DivIcon {
  const color = statusColor(order, selected)
  const speed = Math.round(order.current_position?.speed_kmh ?? 0)

  return L.divIcon({
    className: '',
    html: `<div class="fleet-driver-marker ${selected ? 'is-selected' : ''}" style="--marker-color:${color};">
      <div class="fleet-driver-heading" style="transform:rotate(${bearing}deg);"></div>
      <div class="fleet-driver-avatar">${driverInitials(order)}</div>
      <div class="fleet-driver-meta">
        <strong>${formatId(order.driver_id || order.id)}</strong>
        <span>${speed} km/h · ${Math.max(1, etaMinutes)}m · ${(remainingMeters / 1000).toFixed(1)}km</span>
      </div>
    </div>`,
    iconSize: [126, 42],
    iconAnchor: [22, 22],
  })
}

function stopIcon(_stop: Stop | null, index: number, etaMinutes: number, status: 'warehouse' | 'pending' | 'completed' | 'customer'): L.DivIcon {
  const label = status === 'warehouse' ? 'WH' : status === 'customer' ? 'C' : String(index)
  return L.divIcon({
    className: '',
    html: `<div class="fleet-stop-marker is-${status}">
      <strong>${label}</strong>
      <span>${status === 'completed' ? 'Done' : `${Math.max(1, etaMinutes)}m`}</span>
    </div>`,
    iconSize: [46, 42],
    iconAnchor: [23, 36],
  })
}

function hoverHtml(order: LiveOrder, remainingMeters: number, etaMinutes: number, progress: number): string {
  const color = statusColor(order)
  const risk = Math.round(order.risk_score * 100)
  return `<div class="fleet-map-popover">
    <div class="fleet-popover-head">
      <span>${formatId(order.id)}</span>
      <strong style="color:${color}">${risk}% risk</strong>
    </div>
    <div class="fleet-popover-row"><span>Driver</span><strong>${order.driver_name || formatId(order.driver_id || 'unassigned')}</strong></div>
    <div class="fleet-popover-row"><span>ETA</span><strong>${Math.max(1, etaMinutes)} min remaining</strong></div>
    <div class="fleet-popover-row"><span>Distance</span><strong>${(remainingMeters / 1000).toFixed(1)} km remaining</strong></div>
    <div class="fleet-popover-row"><span>Progress</span><strong>${Math.round(progress * 100)}%</strong></div>
  </div>`
}

function geometryHash(order: LiveOrder): string {
  return routeWaypoints(order).map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join('|')
}

function cumulativeDistances(points: [number, number][]): number[] {
  const distances = [0]
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + L.latLng(points[i - 1]).distanceTo(points[i]))
  }
  return distances
}

function projectPointAtDistance(route: RouteGeometry, distanceMeters: number): { point: [number, number]; bearing: number; index: number } {
  if (route.points.length === 0) return { point: DEFAULT_CENTER, bearing: 0, index: 0 }
  if (route.points.length === 1) return { point: route.points[0], bearing: 0, index: 0 }

  const clamped = Math.max(0, Math.min(distanceMeters, route.totalMeters))
  const nextIndex = route.cumulativeMeters.findIndex((distance) => distance >= clamped)
  const i = Math.max(1, nextIndex === -1 ? route.points.length - 1 : nextIndex)
  const previousDistance = route.cumulativeMeters[i - 1]
  const segmentDistance = Math.max(1, route.cumulativeMeters[i] - previousDistance)
  const t = (clamped - previousDistance) / segmentDistance
  const from = route.points[i - 1]
  const to = route.points[i]
  return {
    point: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t],
    bearing: bearingBetween(from, to),
    index: i,
  }
}

function splitRoute(route: RouteGeometry, progressMeters: number): { completed: [number, number][]; remaining: [number, number][] } {
  const projected = projectPointAtDistance(route, progressMeters)
  const completed = route.points.slice(0, projected.index)
  completed.push(projected.point)
  return {
    completed,
    remaining: [projected.point, ...route.points.slice(projected.index)],
  }
}

function initialProgress(order: LiveOrder, route: RouteGeometry): number {
  const live = getCoordinates(order)
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  route.points.forEach((point, index) => {
    const distance = L.latLng(point).distanceTo(live)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  const ratio = order.status === 'completed' || order.status === 'delivered'
    ? 0.98
    : Math.min(0.78, Math.max(0.05, bestIndex / Math.max(1, route.points.length - 1)))
  return route.cumulativeMeters[bestIndex] || route.totalMeters * ratio
}

function fallbackRoute(points: [number, number][]): RouteGeometry {
  const densified: [number, number][] = []
  points.forEach((point, index) => {
    if (index === 0) {
      densified.push(point)
      return
    }
    const previous = points[index - 1]
    const steps = Math.max(8, Math.ceil(L.latLng(previous).distanceTo(point) / 30000))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const curve = Math.sin(t * Math.PI) * 0.04
      densified.push([
        previous[0] + (point[0] - previous[0]) * t + curve * (point[1] - previous[1]) * 0.12,
        previous[1] + (point[1] - previous[1]) * t - curve * (point[0] - previous[0]) * 0.12,
      ])
    }
  })
  const cumulativeMeters = cumulativeDistances(densified)
  const totalMeters = cumulativeMeters[cumulativeMeters.length - 1] || 1
  return {
    points: densified,
    cumulativeMeters,
    totalMeters,
    durationSeconds: totalMeters / 15,
    stopIndices: points.map((point) => {
      let closest = 0
      let best = Number.POSITIVE_INFINITY
      densified.forEach((candidate, index) => {
        const distance = L.latLng(candidate).distanceTo(point)
        if (distance < best) {
          best = distance
          closest = index
        }
      })
      return closest
    }),
    source: 'fallback',
  }
}

async function fetchRoadRoute(points: [number, number][], signal?: AbortSignal): Promise<RouteGeometry> {
  if (points.length < 2) return fallbackRoute(points)
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const response = await fetch(`${OSRM_ENDPOINT}/${coords}?overview=full&geometries=geojson&steps=false&annotations=false`, { signal })
  if (!response.ok) throw new Error(`OSRM route failed: ${response.status}`)
  const payload = await response.json()
  const route = payload?.routes?.[0]
  const coordinates = route?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error('OSRM route missing geometry')
  const routePoints = coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
  const cumulativeMeters = cumulativeDistances(routePoints)
  const stopIndices = points.map((point) => {
    let closest = 0
    let best = Number.POSITIVE_INFINITY
    routePoints.forEach((candidate, index) => {
      const distance = L.latLng(candidate).distanceTo(point)
      if (distance < best) {
        best = distance
        closest = index
      }
    })
    return closest
  })
  return {
    points: routePoints,
    cumulativeMeters,
    totalMeters: route.distance || cumulativeMeters[cumulativeMeters.length - 1] || 1,
    durationSeconds: route.duration || (cumulativeMeters[cumulativeMeters.length - 1] || 1) / 15,
    stopIndices,
    source: 'osrm',
  }
}

export const FleetMap: React.FC<FleetMapProps> = ({ onOrderSelect, selectedOrderId }) => {
  const orders = useOrdersArray()
  const mapContainerId = useMemo(() => `fleet-map-${Math.random().toString(36).slice(2)}`, [])
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<Map<string, DriverMarker>>(new Map())
  const routeCacheRef = useRef<Map<string, RouteGeometry>>(new Map())
  const routeHashRef = useRef<Map<string, string>>(new Map())
  const routeVisualRef = useRef<Map<string, RouteVisual>>(new Map())
  const vehicleRuntimeRef = useRef<Map<string, VehicleRuntime>>(new Map())
  const destinationRef = useRef<L.Marker[]>([])
  const stopRef = useRef<L.Marker[]>([])
  const riskRef = useRef<L.Circle[]>([])
  const trafficRef = useRef<L.Polyline[]>([])
  const clusterRef = useRef<ClusterState | null>(null)
  const animationRef = useRef<number | null>(null)
  const initializedBoundsRef = useRef(false)

  const [containerReady, setContainerReady] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState<FilterKey>('all')
  const [layers, setLayers] = useState<LayerState>({ traffic: false, route: true, risk: true, driver: true })
  const [, setEtaTick] = useState(0)

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const query = searchQuery.trim().toLowerCase()
      if (query) {
        const haystack = `${order.id} ${order.driver_id} ${order.driver_name ?? ''} ${order.origin ?? ''} ${order.destination ?? ''}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (quickFilter === 'active') return order.status !== 'completed' && order.status !== 'cancelled'
      if (quickFilter === 'delayed') return (order.delay_minutes ?? 0) > 0
      if (quickFilter === 'highRisk') return order.is_high_risk || order.risk_score >= 0.7
      if (quickFilter === 'optimized') return (order as any).is_optimized || order.route_efficiency >= 0.9
      return true
    })
  }, [orders, quickFilter, searchQuery])

  const stats = useMemo(() => ({
    active: orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length,
    delayed: orders.filter((o) => (o.delay_minutes ?? 0) > 0).length,
    risk: orders.filter((o) => o.is_high_risk || o.risk_score >= 0.7).length,
    optimized: orders.filter((o) => (o as any).is_optimized || o.route_efficiency >= 0.9).length,
  }), [orders])

  useLayoutEffect(() => {
    if (mapRef.current) return
    const container = document.getElementById(mapContainerId)
    if (!container) return
    // Leaflet canvas renderer crashes when the container has zero dimensions
    // at init time (clearRect on null context). Defer until sized.
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      const ro = new ResizeObserver(() => {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          ro.disconnect()
          setContainerReady(true)
        }
      })
      ro.observe(container)
      return () => ro.disconnect()
    }
    setContainerReady(true)
  }, [mapContainerId])

  useLayoutEffect(() => {
    if (mapRef.current || !containerReady) return
    const container = document.getElementById(mapContainerId)
    if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) return

    const map = L.map(container, {
      zoomControl: false,
      worldCopyJump: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    map.attributionControl.setPrefix(false)
    mapRef.current = map

    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    ;(map as any).__resizeObserver = observer

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      const resizeObserver = (map as any).__resizeObserver
      if (resizeObserver) resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [containerReady, mapContainerId])

  useEffect(() => {
    const abort = new AbortController()
    filteredOrders.slice(0, 60).forEach((order) => {
      const hash = geometryHash(order)
      if (routeHashRef.current.get(order.id) === hash && routeCacheRef.current.has(order.id)) return

      routeHashRef.current.set(order.id, hash)
      const points = routeWaypoints(order)
      fetchRoadRoute(points, abort.signal)
        .then((route) => {
          routeCacheRef.current.set(order.id, route)
          const runtime = vehicleRuntimeRef.current.get(order.id)
          if (!runtime) {
            vehicleRuntimeRef.current.set(order.id, {
              progressMeters: initialProgress(order, route),
              speedMps: Math.max(7, (order.current_position?.speed_kmh ?? 42) / 3.6),
              lastFrame: performance.now(),
              bearing: 0,
            })
          }
          syncMapRef.current()
        })
        .catch(() => {
          const route = fallbackRoute(points)
          routeCacheRef.current.set(order.id, route)
          if (!vehicleRuntimeRef.current.has(order.id)) {
            vehicleRuntimeRef.current.set(order.id, {
              progressMeters: initialProgress(order, route),
              speedMps: Math.max(7, (order.current_position?.speed_kmh ?? 42) / 3.6),
              lastFrame: performance.now(),
              bearing: 0,
            })
          }
          syncMapRef.current()
        })
    })
    return () => abort.abort()
  }, [filteredOrders])

  const clearGeneratedLayers = useCallback(() => {
    routeVisualRef.current.forEach((visual) => {
      visual.halo?.remove()
      visual.completed?.remove()
      visual.remaining?.remove()
    })
    destinationRef.current.forEach((marker) => marker.remove())
    stopRef.current.forEach((marker) => marker.remove())
    riskRef.current.forEach((circle) => circle.remove())
    trafficRef.current.forEach((route) => route.remove())
    clusterRef.current?.markers.forEach((marker) => marker.remove())
    routeVisualRef.current.clear()
    destinationRef.current = []
    stopRef.current = []
    riskRef.current = []
    trafficRef.current = []
    clusterRef.current = null
  }, [])

  const updateRouteVisual = useCallback((order: LiveOrder) => {
    const route = routeCacheRef.current.get(order.id)
    const visual = routeVisualRef.current.get(order.id)
    const runtime = vehicleRuntimeRef.current.get(order.id)
    if (!route || !visual || !runtime) return
    const split = splitRoute(route, runtime.progressMeters)
    visual.completed?.setLatLngs(split.completed)
    visual.remaining?.setLatLngs(split.remaining)
  }, [])

  const syncMap = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    clearGeneratedLayers()

    const showIndividual = map.getZoom() >= ZOOM_THRESHOLD
    const remaining = new Set(markerRef.current.keys())

    filteredOrders.forEach((order) => {
      const route = routeCacheRef.current.get(order.id)
      const runtime = vehicleRuntimeRef.current.get(order.id)
      const selected = order.id === selectedOrderId
      const projected = route && runtime
        ? projectPointAtDistance(route, runtime.progressMeters)
        : { point: getCoordinates(order), bearing: order.current_position?.heading ?? 0, index: 0 }
      const remainingMeters = route && runtime ? Math.max(0, route.totalMeters - runtime.progressMeters) : order.distance_remaining_km * 1000
      const etaMinutes = Math.max(1, Math.round(remainingMeters / Math.max(1, runtime?.speedMps ?? 12) / 60))

      remaining.delete(order.id)
      const existing = markerRef.current.get(order.id)
      const color = statusColor(order, selected)

      if (existing) {
        existing.order = order
        existing.marker.setLatLng(projected.point)
        existing.marker.setIcon(vehicleIcon(order, selected, projected.bearing, remainingMeters, etaMinutes))
        existing.marker.setPopupContent(hoverHtml(order, remainingMeters, etaMinutes, route ? (runtime?.progressMeters ?? 0) / route.totalMeters : 0))
        existing.ring.setLatLng(projected.point)
        existing.ring.setStyle({ color, opacity: selected ? 0.35 : 0.16, weight: selected ? 2 : 1 })
        existing.ring.setRadius(selected ? 72000 : statusFor(order) === 'critical' ? 48000 : 32000)
      } else {
        const marker = L.marker(projected.point, {
          icon: vehicleIcon(order, selected, projected.bearing, remainingMeters, etaMinutes),
          zIndexOffset: selected ? 900 : statusFor(order) === 'critical' ? 500 : 200,
        }).bindPopup(hoverHtml(order, remainingMeters, etaMinutes, route ? (runtime?.progressMeters ?? 0) / route.totalMeters : 0), {
          closeButton: false,
          className: 'fleet-map-popup',
          offset: [18, -8],
        })

        marker.on('click', () => {
          onOrderSelect?.(order.id)
          const targetRoute = routeCacheRef.current.get(order.id)
          if (targetRoute) {
            const bounds = L.latLngBounds(targetRoute.points)
            if (bounds.isValid()) map.flyToBounds(bounds, { padding: [90, 90], maxZoom: 13, duration: 0.75 })
          } else {
            map.flyTo(projected.point, Math.max(map.getZoom(), 11), { duration: 0.7 })
          }
        })

        const ring = L.circle(projected.point, {
          radius: selected ? 72000 : statusFor(order) === 'critical' ? 48000 : 32000,
          color,
          fillColor: color,
          fillOpacity: selected ? 0.08 : 0.035,
          opacity: selected ? 0.35 : 0.16,
          weight: selected ? 2 : 1,
          interactive: false,
        })

        markerRef.current.set(order.id, { marker, ring, order, visible: false })
      }

      const entry = markerRef.current.get(order.id)!
      const shouldShow = layers.driver && showIndividual
      if (shouldShow && !entry.visible) {
        entry.ring.addTo(map)
        entry.marker.addTo(map)
        entry.visible = true
      } else if (!shouldShow && entry.visible) {
        entry.marker.remove()
        entry.ring.remove()
        entry.visible = false
      }

      if (layers.route && route) {
        const routeColor = routeStateColor(order, selected)
        const split = splitRoute(route, runtime?.progressMeters ?? 0)
        const halo = L.polyline(route.points, {
          color: selected ? COLORS.selectedRoute : routeColor,
          weight: selected ? 13 : 8,
          opacity: selected ? 0.18 : 0.07,
          interactive: false,
        }).addTo(map)
        const completed = L.polyline(split.completed, {
          color: statusFor(order) === 'onSchedule' ? COLORS.completedRoute : routeColor,
          weight: selected ? 6 : 4,
          opacity: selected ? 0.98 : 0.82,
        }).addTo(map)
        const remaining = L.polyline(split.remaining, {
          color: selected ? COLORS.selectedRoute : COLORS.normalRoute,
          weight: selected ? 5 : 3,
          opacity: selected ? 0.86 : 0.56,
          dashArray: selected ? undefined : '8 10',
        }).addTo(map)

        ;[halo, completed, remaining].forEach((line) => {
          line.on('click', () => {
            onOrderSelect?.(order.id)
            const bounds = L.latLngBounds(route.points)
            if (bounds.isValid()) map.flyToBounds(bounds, { padding: [90, 90], maxZoom: 13, duration: 0.75 })
          })
        })

        routeVisualRef.current.set(order.id, { halo, completed, remaining })
      }

      if (layers.risk && (order.risk_score >= 0.7 || order.delay_minutes >= 20)) {
        riskRef.current.push(L.circle(projected.point, {
          radius: 90000,
          color: COLORS.critical,
          fillColor: COLORS.critical,
          fillOpacity: 0.06,
          opacity: 0.18,
          weight: 1,
          interactive: false,
        }).addTo(map))
      }

      if (route && showIndividual) {
        const waypoints = routeWaypoints(order)
        waypoints.forEach((point, index) => {
          const stop = order.stops?.[index - 1] ?? null
          const routeIndex = route.stopIndices[index] ?? 0
          const stopDistance = route.cumulativeMeters[routeIndex] ?? route.totalMeters
          const stopEta = runtime ? Math.max(1, Math.round(Math.max(0, stopDistance - runtime.progressMeters) / Math.max(1, runtime.speedMps) / 60)) : 1
          const status = index === 0
            ? 'warehouse'
            : index === waypoints.length - 1
            ? 'customer'
            : stop?.status === 'completed'
            ? 'completed'
            : 'pending'
          const marker = L.marker(point, { icon: stopIcon(stop, index, stopEta, status), interactive: true })
            .bindPopup(`<div class="fleet-map-popover"><div class="fleet-popover-head"><span>${formatId(order.id)}</span><strong>Stop ${index}</strong></div><div class="fleet-popover-row"><span>Status</span><strong>${status}</strong></div><div class="fleet-popover-row"><span>ETA</span><strong>${Math.max(1, stopEta)} min</strong></div></div>`, {
              closeButton: false,
              className: 'fleet-map-popup',
            })
          marker.on('click', () => onOrderSelect?.(order.id))
          stopRef.current.push(marker.addTo(map))
        })
      }
    })

    remaining.forEach((id) => {
      const entry = markerRef.current.get(id)
      entry?.marker.remove()
      entry?.ring.remove()
      markerRef.current.delete(id)
      vehicleRuntimeRef.current.delete(id)
    })

    if (!showIndividual && filteredOrders.length > 0) {
      clusterRef.current = buildClusters(filteredOrders, map, (clusterOrders) => {
        const bounds = L.latLngBounds(clusterOrders.map(getCoordinates))
        if (bounds.isValid()) map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 12, duration: 0.65 })
      })
    }

    if (layers.traffic) {
      filteredOrders.slice(0, 18).forEach((order) => {
        const route = routeCacheRef.current.get(order.id)
        if (!route || route.points.length < 4) return
        const stride = Math.max(3, Math.floor(route.points.length / 10))
        for (let index = 0; index < route.points.length - stride; index += stride) {
          const congestion = (index + order.id.length) % 3
          trafficRef.current.push(L.polyline(route.points.slice(index, index + stride + 1), {
            color: congestion === 0 ? COLORS.freeTraffic : congestion === 1 ? COLORS.moderateTraffic : COLORS.heavyTraffic,
            weight: 9,
            opacity: congestion === 0 ? 0.18 : congestion === 1 ? 0.24 : 0.3,
            lineCap: 'round',
            interactive: false,
          }).addTo(map))
        }
      })
    }

    if (!initializedBoundsRef.current && filteredOrders.length > 0) {
      const geometries = filteredOrders.map((order) => routeCacheRef.current.get(order.id)?.points ?? [getCoordinates(order)]).flat()
      const bounds = L.latLngBounds(geometries)
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [70, 70], maxZoom: 11 })
        initializedBoundsRef.current = true
      }
    }
  }, [clearGeneratedLayers, filteredOrders, layers, onOrderSelect, selectedOrderId])

  const syncMapRef = useRef(syncMap)
  useEffect(() => {
    syncMapRef.current = syncMap
  }, [syncMap])

  useEffect(() => {
    syncMap()
  }, [syncMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const handleZoom = () => syncMapRef.current()
    map.on('zoomend', handleZoom)
    return () => {
      map.off('zoomend', handleZoom)
    }
  }, [])

  useEffect(() => {
    const tick = (now: number) => {
      filteredOrders.forEach((order) => {
        const route = routeCacheRef.current.get(order.id)
        if (!route) return
        const runtime = vehicleRuntimeRef.current.get(order.id) ?? {
          progressMeters: initialProgress(order, route),
          speedMps: Math.max(7, (order.current_position?.speed_kmh ?? 42) / 3.6),
          lastFrame: now,
          bearing: 0,
        }
        const elapsed = Math.min(2, Math.max(0, (now - runtime.lastFrame) / 1000))
        runtime.lastFrame = now
        runtime.speedMps = runtime.speedMps * 0.96 + Math.max(7, (order.current_position?.speed_kmh ?? 42) / 3.6) * 0.04
        runtime.progressMeters = (runtime.progressMeters + runtime.speedMps * elapsed) % Math.max(route.totalMeters, 1)
        const projected = projectPointAtDistance(route, runtime.progressMeters)
        runtime.bearing = runtime.bearing * 0.82 + projected.bearing * 0.18
        vehicleRuntimeRef.current.set(order.id, runtime)

        const marker = markerRef.current.get(order.id)
        if (marker) {
          const remainingMeters = Math.max(0, route.totalMeters - runtime.progressMeters)
          const etaMinutes = Math.max(1, Math.round(remainingMeters / Math.max(1, runtime.speedMps) / 60))
          marker.marker.setLatLng(projected.point)
          marker.ring.setLatLng(projected.point)
          marker.marker.setIcon(vehicleIcon(order, order.id === selectedOrderId, runtime.bearing, remainingMeters, etaMinutes))
          marker.marker.setPopupContent(hoverHtml(order, remainingMeters, etaMinutes, runtime.progressMeters / route.totalMeters))
          updateRouteVisual(order)
        }
      })
      animationRef.current = requestAnimationFrame(tick)
    }
    animationRef.current = requestAnimationFrame(tick)
    const etaInterval = window.setInterval(() => setEtaTick((value) => value + 1), 1000)
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      window.clearInterval(etaInterval)
    }
  }, [filteredOrders, selectedOrderId, updateRouteVisual])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedOrderId) return
    const route = routeCacheRef.current.get(selectedOrderId)
    if (route) {
      const bounds = L.latLngBounds(route.points)
      if (bounds.isValid()) map.flyToBounds(bounds, { padding: [90, 90], maxZoom: 13, duration: 0.75 })
      return
    }
    const order = orders.find((item) => item.id === selectedOrderId)
    if (order) map.flyTo(getCoordinates(order), Math.max(map.getZoom(), 11), { duration: 0.7 })
  }, [orders, selectedOrderId])

  const filters: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'delayed', label: 'Delayed' },
    { key: 'highRisk', label: 'High Risk' },
    { key: 'optimized', label: 'Optimized' },
  ]

  const layerOptions: Array<{ key: keyof LayerState; label: string; icon: React.ReactNode }> = [
    { key: 'traffic', label: 'Traffic', icon: <TrafficSign size={14} weight="bold" /> },
    { key: 'route', label: 'Routes', icon: <MapTrifold size={14} weight="bold" /> },
    { key: 'risk', label: 'Risk', icon: <Warning size={14} weight="bold" /> },
    { key: 'driver', label: 'Drivers', icon: <Truck size={14} weight="bold" /> },
  ]

  return (
    <div className="fleet-command-map relative h-full w-full overflow-hidden bg-[#E8EBEE]">
      <div id={mapContainerId} className="h-full w-full" />

      <div className="pointer-events-none absolute inset-x-5 top-5 z-[1000] flex items-start justify-between gap-4">
        <div className="pointer-events-auto min-w-[320px] rounded-2xl border border-black/10 bg-white/95 p-3 shadow-[0_18px_46px_rgba(17,19,21,0.18)] backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-charcoal text-amber">
              <Crosshair size={17} weight="bold" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Live control tower</div>
              <div className="text-sm font-semibold text-text-primary">{stats.active} active drivers across {orders.length} deliveries</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <StatPill label="Delayed" value={stats.delayed} tone={stats.delayed > 0 ? 'amber' : 'neutral'} />
            <StatPill label="High Risk" value={stats.risk} tone={stats.risk > 0 ? 'red' : 'neutral'} />
            <StatPill label="Optimized" value={stats.optimized} tone="green" />
            <StatPill label="Shown" value={filteredOrders.length} tone="neutral" />
          </div>
        </div>

        <div className="pointer-events-auto flex max-w-[560px] flex-col items-end gap-2">
          <div className="flex w-full items-center gap-2 rounded-2xl border border-black/10 bg-white/95 p-2 shadow-[0_18px_46px_rgba(17,19,21,0.18)] backdrop-blur-md">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F2F3F5] text-text-secondary">
              <MagnifyingGlass size={16} weight="bold" />
            </div>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search orders, drivers, cities"
              className="h-9 min-w-[260px] flex-1 border-none bg-transparent px-0 py-0 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:ring-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-[#ECEFF3] hover:text-text-primary"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-1.5">
            {filters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setQuickFilter(filter.key)}
                className={clsx(
                  'rounded-xl border px-3 py-2 text-[12px] font-semibold transition active:scale-[0.98]',
                  quickFilter === filter.key
                    ? 'border-amber/30 bg-amber text-charcoal shadow-[0_10px_24px_rgba(244,197,66,0.22)]'
                    : 'border-black/10 bg-white/95 text-text-secondary hover:bg-[#F4F5F6] hover:text-text-primary',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-1.5">
            {layerOptions.map((layer) => (
              <button
                key={layer.key}
                type="button"
                onClick={() => setLayers((previous) => ({ ...previous, [layer.key]: !previous[layer.key] }))}
                className={clsx(
                  'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition active:scale-[0.98]',
                  layers[layer.key]
                    ? 'border-black/10 bg-charcoal text-silver'
                    : 'border-black/10 bg-white/90 text-text-muted hover:text-text-primary',
                )}
              >
                {layers[layer.key] ? layer.icon : <EyeSlash size={14} weight="bold" />}
                {layer.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {orders.length === 0 && (
        <MapEmptyState
          title="No fleet data available"
          body="Orders will appear here once live dispatch connects."
          icon={<Truck size={36} weight="duotone" />}
        />
      )}

      {orders.length > 0 && filteredOrders.length === 0 && (
        <MapEmptyState
          title="No results match this view"
          body="Adjust the search or quick filters to restore deliveries."
          icon={<MagnifyingGlass size={34} weight="duotone" />}
        />
      )}

      {orders.length > 0 && stats.risk === 0 && (
        <div className="absolute bottom-5 right-5 z-[1000] rounded-2xl border border-success/20 bg-white/95 px-4 py-3 shadow-[0_14px_34px_rgba(17,19,21,0.14)]">
          <div className="text-sm font-semibold text-text-primary">All Deliveries Operating Normally</div>
          <div className="text-xs text-text-muted">No high-risk routes are active.</div>
        </div>
      )}

      <div className="absolute bottom-5 left-5 z-[1000] flex flex-wrap items-center gap-3 rounded-2xl border border-black/10 bg-white/95 px-4 py-3 shadow-[0_14px_34px_rgba(17,19,21,0.14)]">
        <LegendDot color={COLORS.onSchedule} label="On Time Route" />
        <LegendDot color={COLORS.atRisk} label="At Risk" />
        <LegendDot color={COLORS.critical} label="Critical" />
        <LegendDot color={COLORS.selected} label="Selected Driver" />
        <span className="mx-1 h-5 w-px bg-black/10" />
        <LegendLine color={COLORS.completedRoute} label="Completed" />
        <LegendLine color={COLORS.normalRoute} label="Remaining" />
        <LegendLine color={COLORS.selectedRoute} label="Selected Route" />
      </div>
    </div>
  )
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'amber' | 'red' | 'green' }) {
  const toneClass = {
    neutral: 'bg-[#F3F4F6] text-text-secondary',
    amber: 'bg-amber/15 text-amber',
    red: 'bg-danger/10 text-danger',
    green: 'bg-success/10 text-success',
  }[tone]
  return (
    <div className={clsx('rounded-xl px-2.5 py-2', toneClass)}>
      <div className="font-mono text-base font-semibold leading-none">{value}</div>
      <div className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.12em]">{label}</div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ backgroundColor: color }} />
      <span className="text-[11px] font-semibold text-text-secondary">{label}</span>
    </div>
  )
}

function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-0.5 w-6 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[11px] font-semibold text-text-secondary">{label}</span>
    </div>
  )
}

function MapEmptyState({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/55 backdrop-blur-[2px]">
      <div className="max-w-sm rounded-3xl border border-black/10 bg-white/95 p-6 text-center shadow-[0_24px_70px_rgba(17,19,21,0.2)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-charcoal text-amber">
          {icon}
        </div>
        <div className="mt-4 text-lg font-semibold text-text-primary">{title}</div>
        <p className="mt-1 text-sm text-text-muted">{body}</p>
      </div>
    </div>
  )
}

export default FleetMap

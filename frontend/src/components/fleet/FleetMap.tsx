import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import L from 'leaflet'
import { useOrdersArray } from '@/store/fleetStore'
import { LiveOrder } from '@/types/api'
import { MagnifyingGlass, Funnel, X } from '@phosphor-icons/react'
import { buildClusters } from './MarkerCluster'
import type { ClusterState } from './MarkerCluster'

interface FleetMapProps {
  onOrderSelect?: (orderId: string) => void
  selectedOrderId?: string | null
}

interface DriverMarker {
  marker: L.CircleMarker
  ring?: L.CircleMarker
  order: LiveOrder
  animating?: boolean
  animStartLat?: number
  animStartLng?: number
  animTargetLat?: number
  animTargetLng?: number
  animStartTime?: number
  animDuration?: number
}

function smoothMoveMarker(dm: DriverMarker, targetLat: number, targetLng: number, speedKmh: number) {
  const speedMs = Math.max(speedKmh, 1) / 3.6
  const dist = L.latLng(dm.marker.getLatLng()).distanceTo(L.latLng(targetLat, targetLng)) / 1000
  let duration = (dist / speedMs) * 1000
  duration = Math.max(200, Math.min(3000, duration))
  dm.animStartLat = dm.marker.getLatLng().lat
  dm.animStartLng = dm.marker.getLatLng().lng
  dm.animTargetLat = targetLat
  dm.animTargetLng = targetLng
  dm.animStartTime = performance.now()
  dm.animDuration = duration
  if (!dm.animating) {
    dm.animating = true
  }
}

function processAnimations(markers: Map<string, DriverMarker>) {
  const now = performance.now()
  markers.forEach((dm) => {
    if (!dm.animating || dm.animStartTime === undefined || dm.animDuration === undefined) return
    const elapsed = now - dm.animStartTime
    const t = Math.min(elapsed / dm.animDuration, 1)
    const eased = t * (2 - t)
    const lat = dm.animStartLat! + (dm.animTargetLat! - dm.animStartLat!) * eased
    const lng = dm.animStartLng! + (dm.animTargetLng! - dm.animStartLng!) * eased
    dm.marker.setLatLng([lat, lng])
    if (dm.ring) dm.ring.setLatLng([lat, lng])
    if (t >= 1) {
      dm.marker.setLatLng([dm.animTargetLat!, dm.animTargetLng!])
      if (dm.ring) dm.ring.setLatLng([dm.animTargetLat!, dm.animTargetLng!])
      dm.animating = false
    }
  })
}

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795]
const DEFAULT_ZOOM = 4

const getRiskColor = (riskScore: number): string => {
  if (riskScore < 0.3) return '#22c55e'
  if (riskScore < 0.7) return '#f59e0b'
  return '#ef4444'
}

const buildPopupHtml = (order: LiveOrder): string => {
  const color = getRiskColor(order.risk_score)
  const riskLabel = order.risk_score < 0.3 ? 'Low' : order.risk_score < 0.7 ? 'Medium' : 'High'
  const delayColor = order.delay_minutes > 10 ? '#EF4444' : order.delay_minutes > 0 ? '#F59E0B' : '#22c55e'
  return `<div style="background:#0F1729;border:1px solid #2A3A5C;border-radius:12px;padding:14px;min-width:220px;font-family:system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span style="color:#F1F5F9;font-weight:600;font-size:14px;font-family:monospace;">${order.id}</span>
      <span style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">${(order.risk_score * 100).toFixed(0)}% ${riskLabel}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#5A6B8A;font-size:11px;">Driver</span>
        <span style="color:#94A3B8;font-size:11px;font-family:monospace;">${order.driver_id}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#5A6B8A;font-size:11px;">Status</span>
        <span style="color:#0EA5E9;font-size:11px;text-transform:capitalize;">${order.status.replace('_', ' ')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#5A6B8A;font-size:11px;">ETA</span>
        <span style="color:#94A3B8;font-size:11px;">${order.current_eta ? new Date(order.current_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#5A6B8A;font-size:11px;">Distance</span>
        <span style="color:#94A3B8;font-size:11px;">${order.distance_remaining_km.toFixed(0)} km</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#5A6B8A;font-size:11px;">Delay</span>
        <span style="color:${delayColor};font-size:11px;">${order.delay_minutes > 0 ? `${order.delay_minutes} min` : 'On time'}</span>
      </div>
    </div>
    <div style="display:flex;gap:4px;">
      <span style="background:rgba(59,130,246,0.12);color:#60A5FA;font-size:10px;font-weight:500;padding:2px 6px;border-radius:4px;">${order.current_position?.speed_kmh.toFixed(0) || '0'} km/h</span>
      <span style="background:rgba(139,92,246,0.12);color:#A78BFA;font-size:10px;font-weight:500;padding:2px 6px;border-radius:4px;">${order.stops.length} stops</span>
    </div>
  </div>`
}

export const FleetMap: React.FC<FleetMapProps> = ({ onOrderSelect, selectedOrderId }) => {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, DriverMarker>>(new Map())
  const polylinesRef = useRef<Map<string, { glow: L.Polyline; main: L.Polyline }>>(new Map())
  const warehouseMarkersRef = useRef<L.Marker[]>([])
  const destinationMarkersRef = useRef<L.Marker[]>([])
  const initialBoundsSet = useRef(false)
  const clusterStateRef = useRef<ClusterState | null>(null)
  const orders = useOrdersArray()
  const [searchQuery, setSearchQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (riskFilter === 'low' && o.risk_score >= 0.3) return false
      if (riskFilter === 'medium' && (o.risk_score < 0.3 || o.risk_score >= 0.7)) return false
      if (riskFilter === 'high' && o.risk_score < 0.7) return false
      if (searchQuery && !o.id.toLowerCase().includes(searchQuery.toLowerCase()) && !o.driver_id?.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [orders, riskFilter, searchQuery])

  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('fleet-map', { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map)
      map.attributionControl.setPrefix(false)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapRef.current = map
    }
    let animFrameId: number
    const tick = () => {
      processAnimations(markersRef.current)
      animFrameId = requestAnimationFrame(tick)
    }
    animFrameId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animFrameId)
      if (mapRef.current) {
        initialBoundsSet.current = false
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  const loadMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const toDelete = new Set(markersRef.current.keys())
    filteredOrders.forEach((order) => {
      if (!order.current_position) return
      const markerId = order.id
      toDelete.delete(markerId)
      const existing = markersRef.current.get(markerId)
      const pos: [number, number] = [order.current_position.lat, order.current_position.lng]

      if (existing) {
        smoothMoveMarker(existing, pos[0], pos[1], order.current_position.speed_kmh)
        existing.order = order
        existing.marker.setStyle({
          fillColor: getRiskColor(order.risk_score),
          color: order.is_high_risk ? '#ef4444' : '#ffffff',
        })
        existing.marker.setRadius(order.is_high_risk ? 9 : 7)
        if (existing.ring) {
          existing.ring.setStyle({
            color: getRiskColor(order.risk_score),
            opacity: order.is_high_risk ? 0.5 : 0.25,
          })
        }
      } else {
        const color = getRiskColor(order.risk_score)
        const marker = L.circleMarker(pos, {
          radius: order.is_high_risk ? 9 : 7,
          fillColor: color,
          color: '#ffffff',
          weight: 2.5,
          opacity: 0.95,
          fillOpacity: 0.85,
          className: order.is_high_risk ? 'animate-marker-pulse' : '',
        })
        const ring = L.circleMarker(pos, {
          radius: order.is_high_risk ? 18 : 14,
          fillColor: 'transparent',
          color: color,
          weight: 1.5,
          opacity: order.is_high_risk ? 0.5 : 0.25,
          className: order.is_high_risk ? 'animate-status-pulse' : '',
        })
        marker.bindPopup(buildPopupHtml(order), {
          closeButton: false,
          className: 'fleet-map-popup',
        })
        marker.on('click', () => onOrderSelect?.(order.id))
        ring.addTo(map)
        marker.addTo(map)
        markersRef.current.set(markerId, { marker, ring, order })
      }
    })

    toDelete.forEach((id) => {
      const dm = markersRef.current.get(id)
      if (dm) {
        if (dm.ring) dm.ring.remove()
        dm.marker.remove()
        markersRef.current.delete(id)
      }
    })
  }, [filteredOrders, onOrderSelect])

  useEffect(() => {
    loadMarkers()
  }, [loadMarkers])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const zoomThreshold = 10
    const updateClusters = () => {
      if (clusterStateRef.current) {
        clusterStateRef.current.markers.forEach((m) => m.remove())
      }
      if (map.getZoom() < zoomThreshold) {
        clusterStateRef.current = buildClusters(filteredOrders, map)
      } else {
        clusterStateRef.current = null
      }
    }
    updateClusters()
    map.on('zoomend', updateClusters)
    return () => {
      map.off('zoomend', updateClusters)
      if (clusterStateRef.current) {
        clusterStateRef.current.markers.forEach((m) => m.remove())
      }
    }
  }, [filteredOrders])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (initialBoundsSet.current) return
    const bounds = L.latLngBounds([])
    let hasValid = false
    markersRef.current.forEach(({ marker }) => {
      if (marker.getLatLng()) {
        bounds.extend(marker.getLatLng())
        hasValid = true
      }
    })
    if (hasValid && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 })
      initialBoundsSet.current = true
    }
  }, [filteredOrders])

  const loadRoute = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    polylinesRef.current.forEach(({ glow, main }) => { glow.remove(); main.remove() })
    polylinesRef.current.clear()

    warehouseMarkersRef.current.forEach((m) => m.remove())
    warehouseMarkersRef.current = []
    destinationMarkersRef.current.forEach((m) => m.remove())
    destinationMarkersRef.current = []

    if (!selectedOrderId) return

    const order = orders.find((o) => o.id === selectedOrderId)
    if (!order) return

    const risk = order.risk_score < 0.3 ? 'low' : order.risk_score < 0.7 ? 'medium' : 'high'
    const routeColor = ROUTE_COLORS[risk]

    if (order.stops.length > 1) {
      const points: [number, number][] = order.stops.map((s) => [s.lat, s.lng])
      const glow = L.polyline(points, {
        color: routeColor, weight: 8, opacity: 0.12, smoothFactor: 1,
      }).addTo(map)
      const main = L.polyline(points, {
        color: routeColor, weight: 2.5, opacity: 0.85, dashArray: '6, 4',
      }).addTo(map)
      polylinesRef.current.set(selectedOrderId, { glow, main })
      for (let i = 0; i < points.length - 1; i++) {
        const from = points[i]
        const to = points[i + 1]
        const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
        const angle = Math.atan2(to[0] - from[0], to[1] - from[1]) * (180 / Math.PI)
        const arrowIcon = L.divIcon({
          className: '',
          html: `<div style="
            width: 12px; height: 12px;
            transform: rotate(${angle}deg);
            color: ${routeColor};
            font-size: 14px;
            line-height: 12px;
            text-align: center;
            text-shadow: 0 0 4px rgba(0,0,0,0.8);
          ">&#10132;</div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        })
        L.marker(mid, { icon: arrowIcon, interactive: false }).addTo(map)
      }
    }

    const visited = new Set<string>()
    order.stops.forEach((s) => {
      const key = `${s.lat.toFixed(4)}_${s.lng.toFixed(4)}`
      if (visited.has(key)) return
      visited.add(key)
      const isWarehouse = s.status === 'completed' || s.sequence === 0
      if (isWarehouse) {
        const m = L.marker([s.lat, s.lng], { icon: createWarehouseIcon() }).addTo(map)
        m.bindPopup(`<div style="background:#0F1729;border:1px solid #2A3A5C;border-radius:8px;padding:10px;font-family:system-ui,sans-serif;">
          <span style="color:#CBD5E1;font-weight:600;font-size:12px;">${s.address || 'Warehouse'}</span>
        </div>`, { closeButton: false })
        warehouseMarkersRef.current.push(m)
      } else {
        const m = L.marker([s.lat, s.lng], { icon: createDestinationIcon() }).addTo(map)
        m.bindPopup(`<div style="background:#0F1729;border:1px solid #2A3A5C;border-radius:8px;padding:10px;font-family:system-ui,sans-serif;">
          <span style="color:#CBD5E1;font-weight:600;font-size:12px;">${s.address || 'Stop'}</span>
          <div style="color:#5A6B8A;font-size:11px;margin-top:4px;">Stop #${s.sequence} — ${s.status}</div>
        </div>`, { closeButton: false })
        destinationMarkersRef.current.push(m)
      }
    })
  }, [selectedOrderId, orders])

  useEffect(() => {
    loadRoute()
  }, [loadRoute])

  const activeCount = useMemo(() => orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length, [orders])
  const highRiskCount = useMemo(() => orders.filter((o) => o.is_high_risk).length, [orders])

  return (
    <div className="relative w-full h-full bg-abyss overflow-hidden">
      <div id="fleet-map" className="w-full h-full" />

      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
        <div className="flex items-center bg-abyss/90 backdrop-blur-sm border border-steel-grey/40 rounded-panel shadow-card overflow-hidden">
          <div className="flex items-center gap-1.5 px-2.5">
            <MagnifyingGlass size={12} className="text-mist" weight="bold" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search orders or drivers..."
            className="bg-transparent border-none outline-none text-[11px] text-pearl placeholder-mist py-2 pr-3 w-40 focus:w-56 transition-all duration-200"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="pr-2 text-mist hover:text-pearl">
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1.5 bg-abyss/90 backdrop-blur-sm border border-steel-grey/40 rounded-panel px-2.5 py-2 shadow-card text-mist hover:text-pearl transition-colors"
        >
          <Funnel size={12} weight={showFilters ? 'fill' : 'regular'} />
        </button>
      </div>

      {showFilters && (
        <div className="absolute top-14 left-3 z-[1000] bg-abyss/95 backdrop-blur-sm border border-steel-grey/40 rounded-panel shadow-card p-3 space-y-2 min-w-[160px]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-mist">Risk Filter</span>
          <div className="flex flex-col gap-1">
            {[
              { key: null, label: 'All' },
              { key: 'low', label: 'Low Risk', color: '#22c55e' },
              { key: 'medium', label: 'Medium Risk', color: '#f59e0b' },
              { key: 'high', label: 'High Risk', color: '#ef4444' },
            ].map((f) => (
              <button
                key={f.key || 'all'}
                onClick={() => setRiskFilter(f.key)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-medium transition-all text-left ${
                  riskFilter === f.key ? 'bg-accent/10 text-accent' : 'text-mist hover:text-pearl hover:bg-slate-blue'
                }`}
              >
                {f.color && <span className="w-2 h-2 rounded-full" style={{ background: f.color }} />}
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-3 bg-abyss/90 backdrop-blur-sm border border-steel-grey/40 rounded-panel px-3 py-2 shadow-card">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
          <span className="text-[11px] text-cloud font-medium">Low</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b] shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
          <span className="text-[11px] text-cloud font-medium">Med</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#ef4444] shadow-[0_0_6px_rgba(239,68,68,0.5)] animate-status-pulse" />
          <span className="text-[11px] text-cloud font-medium">High</span>
        </div>
        <div className="w-px h-4 bg-steel-grey/50 mx-0.5" />
        <span className="text-[11px] text-mist font-medium">{activeCount} active</span>
        {highRiskCount > 0 && (
          <>
            <div className="w-px h-4 bg-steel-grey/50 mx-0.5" />
            <span className="text-[11px] font-medium text-critical-DEFAULT">{highRiskCount} at risk</span>
          </>
        )}
      </div>
    </div>
  )
}

const ROUTE_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
}

const createWarehouseIcon = () => L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="2" y="8" width="24" height="18" rx="2" fill="#3B82F6" fill-opacity="0.2" stroke="#3B82F6" stroke-width="1.5"/>
      <rect x="6" y="12" width="4" height="4" rx="1" fill="#3B82F6"/>
      <rect x="12" y="12" width="4" height="4" rx="1" fill="#3B82F6"/>
      <rect x="18" y="12" width="4" height="4" rx="1" fill="#3B82F6"/>
      <path d="M14 2L4 8h20L14 2z" fill="#3B82F6" fill-opacity="0.3" stroke="#3B82F6" stroke-width="1"/>
    </svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const createDestinationIcon = () => L.divIcon({
  className: '',
  html: `<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#8B5CF6" fill-opacity="0.15" stroke="#8B5CF6" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4" fill="#8B5CF6"/>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#8B5CF6" stroke-width="1" stroke-opacity="0.5"/>
    </svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

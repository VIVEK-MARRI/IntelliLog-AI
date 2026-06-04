import L from 'leaflet'
import type { LiveOrder } from '@/types/api'

interface ClusterData {
  lat: number
  lng: number
  count: number
  highRiskCount: number
  orders: LiveOrder[]
}

type CellKey = string

function cellKey(lat: number, lng: number, gridSize: number): CellKey {
  const clat = Math.floor(lat / gridSize)
  const clng = Math.floor(lng / gridSize)
  return `${clat}:${clng}`
}

function createClusterIcon(data: ClusterData): L.DivIcon {
  const color = data.highRiskCount > 0
    ? '#ef4444'
    : data.count > 5
    ? '#f59e0b'
    : '#3B82F6'
  const pulseClass = data.highRiskCount > 0 ? 'animate-status-pulse' : ''
  return L.divIcon({
    className: '',
    html: `<div class="${pulseClass}" style="
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      background: ${color}22;
      border: 2px solid ${color};
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 0 12px ${color}44;
    ">
      <span style="
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        font-family: 'Geist Mono', monospace;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      ">${data.count}</span>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  })
}

function createClusterMarker(data: ClusterData, map: L.Map, onClick?: (orders: LiveOrder[]) => void): L.Marker {
  const marker = L.marker([data.lat, data.lng], {
    icon: createClusterIcon(data),
    interactive: true,
  })
  marker.bindPopup(`
    <div style="background:#0F1729;border:1px solid #2A3A5C;border-radius:8px;padding:10px;font-family:system-ui,sans-serif;min-width:160px;">
      <div style="color:#CBD5E1;font-weight:600;font-size:13px;margin-bottom:6px;">
        ${data.count} Vehicle${data.count !== 1 ? 's' : ''}
      </div>
      ${data.highRiskCount > 0 ? `<div style="color:#EF4444;font-size:11px;margin-bottom:4px;">${data.highRiskCount} High Risk</div>` : ''}
      <div style="color:#94A3B8;font-size:10px;">${data.count - data.highRiskCount} Normal</div>
    </div>
  `, { closeButton: false, className: 'fleet-map-popup' })
  marker.on('click', () => {
    onClick?.(data.orders)
    if (map.getZoom() < 12) {
      map.fitBounds(data.orders.map(o => [o.current_position!.lat, o.current_position!.lng]), { padding: [50, 50], maxZoom: 14 })
    }
  })
  return marker
}

export interface ClusterState {
  markers: L.Marker[]
  clusterMap: Map<CellKey, { marker: L.Marker; data: ClusterData }>
}

export function buildClusters(
  orders: LiveOrder[],
  map: L.Map,
  onClusterClick?: (orders: LiveOrder[]) => void
): ClusterState {
  const zoom = map.getZoom()
  const gridSize = zoom < 6 ? 5 : zoom < 8 ? 2.5 : zoom < 10 ? 1 : zoom < 12 ? 0.5 : 0.2
  const cellMap = new Map<CellKey, ClusterData>()

  orders.forEach((order) => {
    if (!order.current_position) return
    const ck = cellKey(order.current_position.lat, order.current_position.lng, gridSize)
    const existing = cellMap.get(ck)
    if (existing) {
      existing.count++
      existing.highRiskCount += order.is_high_risk ? 1 : 0
      existing.orders.push(order)
      existing.lat = (existing.lat * (existing.count - 1) + order.current_position.lat) / existing.count
      existing.lng = (existing.lng * (existing.count - 1) + order.current_position.lng) / existing.count
    } else {
      cellMap.set(ck, {
        lat: order.current_position.lat,
        lng: order.current_position.lng,
        count: 1,
        highRiskCount: order.is_high_risk ? 1 : 0,
        orders: [order],
      })
    }
  })

  const markers: L.Marker[] = []
  const clusterMap = new Map<CellKey, { marker: L.Marker; data: ClusterData }>()
  cellMap.forEach((data, ck) => {
    if (data.count === 1) return
    const marker = createClusterMarker(data, map, onClusterClick)
    marker.addTo(map)
    markers.push(marker)
    clusterMap.set(ck, { marker, data })
  })

  return { markers, clusterMap }
}

export function rebuildClusters(
  prevState: ClusterState,
  orders: LiveOrder[],
  map: L.Map,
  onClusterClick?: (orders: LiveOrder[]) => void
): ClusterState {
  prevState.markers.forEach((m) => m.remove())
  return buildClusters(orders, map, onClusterClick)
}

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
    ? '#EF4444'
    : data.count > 5
    ? '#F4C542'
    : '#A8B0BB'

  const size = data.count <= 3 ? 76 : data.count <= 8 ? 88 : 104
  const fontSize = size <= 76 ? 17 : size <= 88 ? 19 : 22

  return L.divIcon({
    className: '',
    html: `<div style="
      width: ${size}px; height: 54px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: linear-gradient(180deg,#FFFFFF 0%,#EEF1F4 100%);
      border: 1px solid rgba(17,19,21,0.16);
      border-left: 4px solid ${color};
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 14px 32px rgba(17,19,21,0.22), 0 2px 4px rgba(17,19,21,0.12);
      transition: all 0.2s ease;
    ">
      <span style="
        color: #111315;
        font-size: ${fontSize}px;
        font-weight: 750;
        font-family: 'Geist Mono', monospace;
        line-height: 0.95;
        letter-spacing: -0.03em;
      ">${data.count}</span>
      <span style="
        color: #4B5563;
        font-size: 9px;
        font-weight: 650;
        letter-spacing: 0.08em;
        margin-top: 3px;
        text-transform: uppercase;
      ">DELIVERIES</span>
      <span style="
        color: ${data.highRiskCount > 0 ? '#EF4444' : '#6B7280'};
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.02em;
        margin-top: 2px;
      ">${data.count} drivers · ${data.highRiskCount} at risk</span>
    </div>`,
    iconSize: [size, 54],
    iconAnchor: [size / 2, 27],
  })
}

function createClusterMarker(data: ClusterData, map: L.Map, onClick?: (orders: LiveOrder[]) => void): L.Marker {
  const marker = L.marker([data.lat, data.lng], {
    icon: createClusterIcon(data),
    interactive: true,
  })

  marker.bindPopup(`
    <div style="background:#111315;border:1px solid #2A3038;border-radius:12px;padding:12px;font-family:'Geist',system-ui,sans-serif;min-width:180px;">
      <div style="color:#D9DDE3;font-weight:600;font-size:13px;margin-bottom:6px;">
        ${data.count} Delivery${data.count !== 1 ? 'ies' : ''}
      </div>
      ${data.highRiskCount > 0
        ? `<div style="color:#EF4444;font-size:11px;margin-bottom:4px;">${data.highRiskCount} High Risk</div>`
        : ''
      }
      <div style="color:#A8B0BB;font-size:10px;">${data.count - data.highRiskCount} Normal</div>
    </div>
  `, { closeButton: false, className: 'fleet-map-popup' })

  marker.on('click', () => {
    onClick?.(data.orders)
    if (map.getZoom() < 12) {
      const bounds = L.latLngBounds(
        data.orders.map(o => {
          const c = o.current_position
          if (c && isFinite(c.lat) && isFinite(c.lng) && (c.lat !== 0 || c.lng !== 0)) {
            return [c.lat, c.lng]
          }
          return [data.lat, data.lng]
        }),
      )
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
      }
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
  onClusterClick?: (orders: LiveOrder[]) => void,
): ClusterState {
  const zoom = map.getZoom()
  const gridSize = zoom < 6 ? 5 : zoom < 8 ? 2.5 : zoom < 10 ? 1 : zoom < 12 ? 0.5 : 0.2
  const cellMap = new Map<CellKey, ClusterData>()

  orders.forEach((order) => {
    const pos = getClusterPosition(order)
    if (!pos) return
    const ck = cellKey(pos[0], pos[1], gridSize)
    const existing = cellMap.get(ck)
    if (existing) {
      existing.count++
      existing.highRiskCount += order.is_high_risk ? 1 : 0
      existing.orders.push(order)
      existing.lat = (existing.lat * (existing.count - 1) + pos[0]) / existing.count
      existing.lng = (existing.lng * (existing.count - 1) + pos[1]) / existing.count
    } else {
      cellMap.set(ck, {
        lat: pos[0],
        lng: pos[1],
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
  onClusterClick?: (orders: LiveOrder[]) => void,
): ClusterState {
  prevState.markers.forEach((m) => m.remove())
  return buildClusters(orders, map, onClusterClick)
}

/** Extract coordinates for clustering with wider tolerance than the map markers. */
function getClusterPosition(order: LiveOrder): [number, number] | null {
  const candidates: Array<[number | undefined | null, number | undefined | null]> = [
    [order.current_position?.lat, order.current_position?.lng],
    [(order as any).latitude, (order as any).longitude],
    [(order as any).lat, (order as any).lng],
    [(order as any).location?.latitude, (order as any).location?.longitude],
    [(order as any).current_location?.lat, (order as any).current_location?.lng],
    [(order as any).origin_lat, (order as any).origin_lng],
  ]
  for (const [lat, lng] of candidates) {
    const nlat = Number(lat)
    const nlng = Number(lng)
    if (!isNaN(nlat) && !isNaN(nlng) && isFinite(nlat) && isFinite(nlng)) {
      return [nlat, nlng]
    }
  }
  return null
}

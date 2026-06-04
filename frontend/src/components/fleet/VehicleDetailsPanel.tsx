import React from 'react'
import { useOrdersArray } from '@/store/fleetStore'
import { X, Truck, Speedometer, Compass, Clock, MapPin, Warning } from '@phosphor-icons/react'
import { RiskBadge } from '@/components/shared/RiskBadge'
import clsx from 'clsx'

interface VehicleDetailsPanelProps {
  orderId: string | null
  onClose: () => void
}

export const VehicleDetailsPanel: React.FC<VehicleDetailsPanelProps> = ({ orderId, onClose }) => {
  const orders = useOrdersArray()
  const order = orders.find((o) => o.id === orderId)

  if (!orderId || !order) return null

  const progress = order.stops
    ? `${order.stops.filter((s) => s.status === 'completed').length}/${order.stops.length}`
    : '-'

  return (
    <div className="bg-abyss border border-steel-grey/40 rounded-xl overflow-hidden shadow-elevated animate-slide-in-right">
      <div className="flex items-center justify-between px-4 py-3 bg-obsidian border-b border-steel-grey/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
            <Truck size={14} weight="fill" className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-pearl font-mono">{order.id}</p>
            <p className="text-[10px] text-mist">{order.driver_id}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-navy rounded text-mist hover:text-pearl transition-colors"
          aria-label="Close details panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <RiskBadge score={order.risk_score} size="md" />
          <span className={clsx(
            'text-xs font-semibold px-2 py-0.5 rounded-full',
            order.status === 'active' && 'bg-accent/10 text-accent',
            order.status === 'in_progress' && 'bg-warning-DEFAULT/10 text-warning-DEFAULT',
            order.status === 'completed' && 'bg-success-DEFAULT/10 text-success-DEFAULT',
          )}>
            {order.status.replace('_', ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DetailItem
            icon={<Speedometer size={14} className="text-accent" />}
            label="Speed"
            value={order.current_position ? `${order.current_position.speed_kmh.toFixed(0)} km/h` : '-'}
          />
          <DetailItem
            icon={<Compass size={14} className="text-teal-DEFAULT" />}
            label="Heading"
            value={order.current_position ? `${order.current_position.heading.toFixed(0)}°` : '-'}
          />
          <DetailItem
            icon={<Clock size={14} className="text-warning-DEFAULT" />}
            label="ETA"
            value={new Date(order.current_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          />
          <DetailItem
            icon={<MapPin size={14} className="text-success-DEFAULT" />}
            label="Distance"
            value={`${order.distance_remaining_km.toFixed(0)} km`}
          />
        </div>

        <div className="border-t border-steel-grey/20 pt-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-mist">Stops</span>
            <span className="text-cloud font-mono">{progress}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-mist">Delay</span>
            <span className={clsx(
              'font-mono',
              order.delay_minutes > 10 ? 'text-critical-DEFAULT' : order.delay_minutes > 0 ? 'text-warning-DEFAULT' : 'text-success-DEFAULT'
            )}>
              {order.delay_minutes > 0 ? `${order.delay_minutes.toFixed(0)}m` : 'On time'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-mist">Route Efficiency</span>
            <span className="text-cloud font-mono">{order.route_efficiency.toFixed(0)}%</span>
          </div>
          {order.delay_minutes > 5 && (
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-warning-DEFAULT">
              <Warning size={10} weight="fill" />
              <span>Delayed — check route</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface DetailItemProps {
  icon: React.ReactNode
  label: string
  value: string
}

const DetailItem: React.FC<DetailItemProps> = ({ icon, label, value }) => (
  <div className="bg-obsidian rounded-lg p-3 border border-steel-grey/20">
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <span className="text-[10px] text-mist">{label}</span>
    </div>
    <span className="text-sm font-semibold text-cloud">{value}</span>
  </div>
)

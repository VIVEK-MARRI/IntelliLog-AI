import React, { useMemo } from 'react'
import { useOrdersArray } from '@/store/fleetStore'
import { Truck, WifiSlash, Warning, Clock, Gauge, Users } from '@phosphor-icons/react'
import clsx from 'clsx'

export const FleetHealthBar: React.FC = () => {
  const orders = useOrdersArray()

  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled')
    const highRisk = active.filter((o) => o.is_high_risk)
    const uniqueDrivers = new Set(orders.map((o) => o.driver_id))
    const avgDelay = active.length > 0
      ? active.reduce((s, o) => s + (o.delay_minutes || 0), 0) / active.length
      : 0
    const avgEfficiency = active.length > 0
      ? active.reduce((s, o) => s + (o.route_efficiency || 100), 0) / active.length
      : 100
    return {
      activeCount: active.length,
      highRiskCount: highRisk.length,
      driverCount: uniqueDrivers.size,
      avgDelay: avgDelay,
      avgEfficiency: avgEfficiency,
      completedToday: orders.filter((o) => o.status === 'completed').length,
    }
  }, [orders])

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <StatItem
        icon={<Truck size={13} weight="fill" className="text-accent" />}
        label="Active"
        value={stats.activeCount}
      />
      <StatItem
        icon={<Users size={13} weight="fill" className="text-teal-DEFAULT" />}
        label="Drivers"
        value={stats.driverCount}
      />
      <StatItem
        icon={<Warning size={13} weight="fill" className="text-critical-DEFAULT" />}
        label="High Risk"
        value={stats.highRiskCount}
        accent={stats.highRiskCount > 0 ? 'text-critical-DEFAULT' : undefined}
      />
      <StatItem
        icon={<Clock size={13} weight="fill" className="text-warning-DEFAULT" />}
        label="Avg Delay"
        value={`${stats.avgDelay.toFixed(0)}m`}
        accent={stats.avgDelay > 10 ? 'text-critical-DEFAULT' : stats.avgDelay > 3 ? 'text-warning-DEFAULT' : undefined}
      />
      <StatItem
        icon={<Gauge size={13} weight="fill" className="text-success-DEFAULT" />}
        label="Efficiency"
        value={`${stats.avgEfficiency.toFixed(0)}%`}
        accent={stats.avgEfficiency < 70 ? 'text-critical-DEFAULT' : stats.avgEfficiency < 85 ? 'text-warning-DEFAULT' : undefined}
      />
      <StatItem
        icon={<WifiSlash size={13} className="text-mist" />}
        label="Completed"
        value={stats.completedToday}
      />
    </div>
  )
}

interface StatItemProps {
  icon: React.ReactNode
  label: string
  value: string | number
  accent?: string
}

const StatItem: React.FC<StatItemProps> = ({ icon, label, value, accent }) => (
  <div className="flex items-center gap-2 bg-obsidian rounded-lg px-3 py-2 border border-steel-grey/20">
    {icon}
    <div className="flex items-baseline gap-1.5">
      <span className={clsx('text-sm font-bold', accent || 'text-cloud')}>{value}</span>
      <span className="text-[9px] text-mist uppercase tracking-wider">{label}</span>
    </div>
  </div>
)

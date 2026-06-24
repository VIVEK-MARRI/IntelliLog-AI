import React, { useMemo } from 'react'
import { fleetStore, useOrdersArray } from '@/store/fleetStore'
import { useActivityStore } from '@/store/activityStore'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { Gauge, Warning, Clock, ChartBar, TrendUp, TrendDown } from '@phosphor-icons/react'
import clsx from 'clsx'

export const OperationalIntelligence: React.FC = () => {
  const orders = useOrdersArray()
  const connectionStatus = fleetStore((s) => s.connectionStatus)
  const eventCount = useActivityStore((s) => s.events.length)
  const decisions = fleetStore((s) => s.agentDecisions)
  const { metrics, fleetHealth } = useDashboardMetrics()

  const stats = useMemo(() => {
    const highRisk = orders.filter((o) => o.is_high_risk).length
    const active = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length
    const etaDrifted = orders.filter((o) => {
      if (!o.current_eta || !o.planned_eta) return false
      return new Date(o.current_eta).getTime() !== new Date(o.planned_eta).getTime()
    }).length
    const avgDelay = orders.length > 0
      ? orders.reduce((s, o) => s + (o.delay_minutes ?? 0), 0) / orders.length
      : 0

    return { highRisk, active, etaDrifted, avgDelay }
  }, [orders])

  const healthScore = fleetHealth?.score ?? null
  const healthStatus = fleetHealth?.status ?? null
  const healthTrend = fleetHealth?.trend ?? 0
  const onTimeRate = metrics?.on_time_percentage ?? null

  const connected = connectionStatus === 'connected'
  const reconnecting = connectionStatus === 'connecting' || connectionStatus === 'reconnecting'

  return (
    <div className="space-y-5">
      {healthScore !== null && (
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-pearl flex items-center gap-2">
              <Gauge size={14} className="text-accent" />
              Fleet Health
            </h3>
            <div className="flex items-center gap-2">
              {healthTrend !== 0 && (
                <span className={clsx(
                  'text-[10px] font-semibold flex items-center gap-0.5',
                  healthTrend > 0 ? 'text-success' : 'text-critical'
                )}>
                  {healthTrend > 0 ? <TrendUp size={10} /> : <TrendDown size={10} />}
                  {Math.abs(healthTrend).toFixed(0)}%
                </span>
              )}
              <span className={clsx(
                'text-[10px] font-semibold px-2 py-0.5 rounded',
                healthStatus === 'excellent' || healthStatus === 'healthy' ? 'text-success bg-success/10' :
                healthStatus === 'warning' ? 'text-warning bg-warning/10' : 'text-critical bg-critical/10'
              )}>
                {healthStatus ?? '—'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className={clsx(
              'text-3xl font-bold font-mono',
              (healthScore ?? 0) >= 80 ? 'text-success' : (healthScore ?? 0) >= 50 ? 'text-warning' : 'text-critical'
            )}>
              {healthScore.toFixed(0)}%
            </span>
            <div className="flex-1 h-3 bg-navy rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  (healthScore ?? 0) >= 80 ? 'bg-success/60' : (healthScore ?? 0) >= 50 ? 'bg-warning/60' : 'bg-critical/60'
                )}
                style={{ width: `${Math.min(healthScore, 100)}%` }}
              />
            </div>
          </div>
          {onTimeRate !== null && (
            <div className="mt-3 grid grid-cols-3 gap-3 pt-3 border-t border-steel-grey/20">
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-pearl">{onTimeRate.toFixed(0)}%</p>
                <p className="text-[10px] text-mist/60">On-Time Rate</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-pearl">{stats.active}</p>
                <p className="text-[10px] text-mist/60">Active Orders</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold font-mono text-pearl">{decisions.length}</p>
                <p className="text-[10px] text-mist/60">Interventions</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Warning size={12} className="text-critical" />
            <h3 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Orders at Risk</h3>
          </div>
          <p className={clsx(
            'text-2xl font-bold font-mono',
            stats.highRisk > 3 ? 'text-critical' : stats.highRisk > 0 ? 'text-warning' : 'text-success'
          )}>
            {stats.highRisk}
          </p>
          <p className="text-[10px] text-mist/60 mt-1">
            {stats.active > 0 ? `${(stats.highRisk / stats.active * 100).toFixed(0)}% of active` : 'No active orders'}
          </p>
        </div>

        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={12} className="text-warning" />
            <h3 className="text-[10px] font-semibold text-mist uppercase tracking-wider">ETA Drift</h3>
          </div>
          <p className={clsx(
            'text-2xl font-bold font-mono',
            stats.etaDrifted > 5 ? 'text-critical' : stats.etaDrifted > 0 ? 'text-warning' : 'text-success'
          )}>
            {stats.etaDrifted}
          </p>
          <p className="text-[10px] text-mist/60 mt-1">
            {stats.etaDrifted > 0 ? `${stats.etaDrifted} order${stats.etaDrifted !== 1 ? 's' : ''} off schedule` : 'All on schedule'}
          </p>
        </div>
      </div>

      <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <ChartBar size={14} className="text-accent" />
          <h3 className="text-sm font-semibold text-pearl">Realtime Event Volume</h3>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono text-pearl">{eventCount}</span>
            <span className="text-xs text-mist/60">total events this session</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx(
              'w-2 h-2 rounded-full',
              connected ? 'bg-success animate-pulse' : reconnecting ? 'bg-warning animate-pulse' : 'bg-critical'
            )} />
            <span className={clsx(
              'text-[10px] font-medium',
              connected ? 'text-success' : reconnecting ? 'text-warning' : 'text-critical'
            )}>
              {connected ? 'Live' : reconnecting ? 'Reconnecting' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {!healthScore && orders.length === 0 && eventCount === 0 && (
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-6 text-center">
          <Gauge size={24} className="text-mist/30 mx-auto mb-2" />
          <p className="text-sm text-mist font-medium">No operational data yet</p>
          <p className="text-xs text-mist/60 mt-1">Connect to start receiving real-time metrics</p>
        </div>
      )}
    </div>
  )
}

import React, { useMemo } from 'react'
import { fleetStore, useOrdersArray } from '@/store/fleetStore'
import { useActivityStore } from '@/store/activityStore'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import clsx from 'clsx'
import { format } from 'date-fns'
import {
  Gauge, Warning, Brain,
  TrendUp, TrendDown, CheckCircle, WarningCircle, SealCheck,
  ArrowsClockwise,
} from '@phosphor-icons/react'

const formatOrderId = (id: string): string =>
  id.length > 7 ? id.slice(0, 7).toUpperCase() : id.toUpperCase()

const formatTimeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export const Executive: React.FC = () => {
  const orders = useOrdersArray()
  const decisions = fleetStore((s) => s.agentDecisions)
  const connectionStatus = fleetStore((s) => s.connectionStatus)
  const events = useActivityStore((s) => s.events)
  const { metrics, fleetHealth } = useDashboardMetrics()

  const connected = connectionStatus === 'connected'
  const reconnecting = connectionStatus === 'connecting' || connectionStatus === 'reconnecting'

  const kpi = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length
    const highRisk = orders.filter((o) => o.is_high_risk).length
    const delayed = orders.filter((o) => (o.delay_minutes ?? 0) > 0).length
    const totalTimeSaved = decisions.reduce((s, d) => s + (d.impact?.time_saved_minutes ?? 0), 0)
    const successful = decisions.filter((d) => d.outcome === 'success').length
    const totalDecisions = decisions.length || 1
    const successRate = (successful / totalDecisions) * 100
    const healthScore = fleetHealth?.score ?? null
    const interventions = metrics?.agent_interventions ?? decisions.length
    const avgDelay = orders.length > 0
      ? orders.reduce((s, o) => s + (o.delay_minutes ?? 0), 0) / orders.length
      : 0
    return { activeOrders, highRisk, delayed, totalTimeSaved, successRate, healthScore, interventions, avgDelay }
  }, [orders, decisions, fleetHealth, metrics])

  const timeline = useMemo(() => {
    const items: Array<{ id: string; timestamp: string; type: string; label: string; detail: string; severity: string }> = []

    for (const d of decisions) {
      items.push({
        id: `dec-${d.id}`, timestamp: d.created_at,
        type: d.decision_type === 'reroute' ? 'Reroute' : d.decision_type === 'alert' ? 'Alert' : 'No Action',
        label: formatOrderId(d.order_id),
        detail: d.reasoning.slice(0, 90),
        severity: d.decision_type === 'reroute' ? 'critical' : d.decision_type === 'alert' ? 'warning' : 'info',
      })
    }

    for (const e of events) {
      items.push({
        id: `evt-${e.id}`, timestamp: e.timestamp, type: e.title,
        label: e.orderId ? formatOrderId(e.orderId) : '',
        detail: e.description,
        severity: e.severity,
      })
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return items.slice(0, 15)
  }, [decisions, events])

  if (orders.length === 0 && decisions.length === 0 && events.length === 0 && !fleetHealth) {
    return (
      <div className="h-full flex items-center justify-center bg-charcoal">
        <div className="text-center max-w-md px-6">
          <Gauge size={48} className="text-silver-muted/20 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-silver mb-2">Executive Dashboard</h2>
          <p className="text-sm text-silver-muted/60 mb-6">Loading operational data...</p>
          <div className="flex items-center justify-center gap-2">
            <span className={clsx('w-2 h-2 rounded-full', reconnecting ? 'bg-amber animate-pulse' : 'bg-success animate-pulse')} />
            <span className={clsx('text-xs font-medium', reconnecting ? 'text-amber' : 'text-success')}>
              {reconnecting ? 'Connecting...' : 'Waiting for data'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const onTimeRate = metrics?.on_time_percentage ?? null

  return (
    <div className="h-full overflow-y-auto bg-charcoal">
      <div className="max-w-6xl mx-auto p-page space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-silver tracking-tight">Executive Dashboard</h1>
            <p className="text-sm text-silver-muted/60 mt-0.5">
              {format(new Date(), 'EEEE, MMMM d, yyyy')} ·{' '}
              <span className={clsx('font-medium', connected ? 'text-success' : reconnecting ? 'text-amber' : 'text-danger')}>
                {connected ? 'Live' : reconnecting ? 'Reconnecting...' : 'Offline'}
              </span>
            </p>
          </div>
          <span className={clsx('w-2 h-2 rounded-full', connected ? 'bg-success' : reconnecting ? 'bg-amber animate-pulse' : 'bg-danger')} />
        </div>

        {/* ── Business Impact ── */}
        <section className="bg-graphite rounded-card border border-slate/20 overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate/20">
            <Gauge size={16} className="text-amber" weight="fill" />
            <h2 className="text-lg font-display text-silver">Business Impact</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="border-l-2 border-amber/40 pl-5 py-3">
              <p className="text-sm text-silver-muted leading-relaxed">
                {kpi.totalTimeSaved > 0
                  ? `AI interventions prevented an estimated ${kpi.totalTimeSaved} minutes of delivery delay today across ${kpi.interventions} actions. `
                  : 'Fleet is operating within normal parameters. '
                }
                Fleet health is{' '}
                <span className={clsx('font-semibold', kpi.healthScore !== null && kpi.healthScore >= 80 ? 'text-success' : kpi.healthScore !== null && kpi.healthScore >= 50 ? 'text-amber' : 'text-silver')}>
                  {kpi.healthScore !== null ? `${kpi.healthScore.toFixed(0)}%` : '—'}
                </span>
                , with {kpi.activeOrders} active orders and a {onTimeRate !== null ? `${onTimeRate.toFixed(0)}%` : '—'} on-time delivery rate.
                {kpi.highRisk > 0 && ` ${kpi.highRisk} high-risk shipment${kpi.highRisk > 1 ? 's' : ''} require attention.`}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-charcoal rounded-card border border-slate/20 px-5 py-4">
                <p className="text-xs text-silver-muted/60 font-medium uppercase tracking-wider mb-1">Fleet Health</p>
                <div className="flex items-baseline gap-2">
                  <span className={clsx(
                    'text-3xl font-semibold font-mono tracking-tight',
                    kpi.healthScore !== null && kpi.healthScore >= 80 ? 'text-success' :
                    kpi.healthScore !== null && kpi.healthScore >= 50 ? 'text-amber' :
                    'text-silver'
                  )}>
                    {kpi.healthScore !== null ? `${kpi.healthScore.toFixed(0)}%` : '—'}
                  </span>
                  {fleetHealth?.trend ? (
                    <span className={clsx('text-xs font-semibold flex items-center gap-0.5', fleetHealth.trend > 0 ? 'text-success' : 'text-danger')}>
                      {fleetHealth.trend > 0 ? <TrendUp size={12} /> : <TrendDown size={12} />}
                      {Math.abs(fleetHealth.trend).toFixed(0)}%
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-silver-muted/50 mt-1 capitalize">{fleetHealth?.status?.replace('_', ' ') ?? 'awaiting data'}</p>
              </div>
              <div className="bg-charcoal rounded-card border border-slate/20 px-5 py-4">
                <p className="text-xs text-silver-muted/60 font-medium uppercase tracking-wider mb-1">Active Orders</p>
                <p className="text-3xl font-semibold font-mono tracking-tight text-silver">{kpi.activeOrders}</p>
                <p className="text-xs text-silver-muted/50 mt-1">{orders.length} total in system</p>
              </div>
              <div className="bg-charcoal rounded-card border border-slate/20 px-5 py-4">
                <p className="text-xs text-silver-muted/60 font-medium uppercase tracking-wider mb-1">On-Time Rate</p>
                <p className="text-3xl font-semibold font-mono tracking-tight text-success">{onTimeRate !== null ? `${onTimeRate.toFixed(0)}%` : '—'}</p>
                <p className="text-xs text-silver-muted/50 mt-1">delivery accuracy</p>
              </div>
              <div className="bg-charcoal rounded-card border border-slate/20 px-5 py-4">
                <p className="text-xs text-silver-muted/60 font-medium uppercase tracking-wider mb-1">Time Saved</p>
                <p className="text-3xl font-semibold font-mono tracking-tight text-amber">{kpi.totalTimeSaved}m</p>
                <p className="text-xs text-silver-muted/50 mt-1">by AI interventions</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Risk Exposure ── */}
        <section className="bg-graphite rounded-card border border-slate/20 overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate/20">
            <Warning size={16} className="text-amber" weight="fill" />
            <h2 className="text-lg font-display text-silver">Risk Exposure</h2>
            {kpi.highRisk > 0 && (
              <span className="ml-auto text-xs font-semibold text-danger bg-danger/20 px-2 py-0.5 rounded">{kpi.highRisk} at risk</span>
            )}
          </div>
          <div className="p-6 space-y-5">
            {kpi.highRisk > 0 && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 flex items-center gap-3">
                <Warning size={18} className="text-danger shrink-0" weight="fill" />
                <p className="text-sm text-danger font-medium">
                  {kpi.highRisk} high-risk order{kpi.highRisk !== 1 ? 's' : ''} require immediate attention
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-charcoal rounded-card border border-slate/20 px-5 py-4 text-center">
                <p className="text-xs text-silver-muted/60 font-medium uppercase tracking-wider mb-1">Orders at Risk</p>
                <p className={clsx('text-3xl font-semibold font-mono', kpi.highRisk > 0 ? 'text-danger' : 'text-success')}>{kpi.highRisk}</p>
                <p className="text-xs text-silver-muted/50 mt-1">{kpi.highRisk > 0 ? 'requires attention' : 'all clear'}</p>
              </div>
              <div className="bg-charcoal rounded-card border border-slate/20 px-5 py-4 text-center">
                <p className="text-xs text-silver-muted/60 font-medium uppercase tracking-wider mb-1">Delayed</p>
                <p className={clsx('text-3xl font-semibold font-mono', kpi.delayed > 0 ? 'text-amber' : 'text-silver-muted')}>{kpi.delayed}</p>
                <p className="text-xs text-silver-muted/50 mt-1">{kpi.avgDelay.toFixed(1)}m avg delay</p>
              </div>
              <div className="bg-charcoal rounded-card border border-slate/20 px-5 py-4 text-center">
                <p className="text-xs text-silver-muted/60 font-medium uppercase tracking-wider mb-1">Avg Delay</p>
                <p className={clsx('text-3xl font-semibold font-mono', kpi.avgDelay > 0 ? 'text-amber' : 'text-silver-muted')}>{kpi.avgDelay.toFixed(1)}m</p>
                <p className="text-xs text-silver-muted/50 mt-1">across fleet</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── AI Impact ── */}
        <section className="bg-graphite rounded-card border border-slate/20 overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate/20">
            <Brain size={16} className="text-amber" weight="fill" />
            <h2 className="text-lg font-display text-silver">AI Impact</h2>
            <span className="ml-auto text-xs font-medium text-amber bg-amber/20 px-2 py-0.5 rounded">{kpi.interventions} interventions</span>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-charcoal rounded-card border border-slate/20 px-5 py-4">
                <p className="text-xs text-silver-muted/60 font-medium uppercase tracking-wider mb-1">Delay Minutes Prevented</p>
                <p className="text-3xl font-semibold font-mono text-amber mt-1">{kpi.totalTimeSaved}</p>
                <p className="text-xs text-silver-muted/50 mt-1">by AI rerouting</p>
              </div>
              <div className="bg-charcoal rounded-card border border-slate/20 px-5 py-4">
                <p className="text-xs text-silver-muted/60 font-medium uppercase tracking-wider mb-1">Success Rate</p>
                <p className={clsx('text-3xl font-semibold font-mono mt-1', kpi.successRate >= 80 ? 'text-success' : 'text-amber')}>{kpi.successRate.toFixed(0)}%</p>
                <p className="text-xs text-silver-muted/50 mt-1">intervention effectiveness</p>
              </div>
            </div>

            {/* Success Rate Bar */}
            <div className="bg-charcoal rounded-card border border-slate/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-silver-muted">Intervention Success Rate</span>
                <span className={clsx('text-lg font-semibold font-mono', kpi.successRate >= 80 ? 'text-success' : 'text-amber')}>
                  {kpi.successRate.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-charcoal rounded-full h-2.5 overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all', kpi.successRate >= 80 ? 'bg-success/70' : 'bg-amber/70')}
                  style={{ width: `${Math.min(kpi.successRate, 100)}%` }}
                />
              </div>
            </div>

            {/* Activity Timeline */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-silver-muted/60">Recent Activity</h4>
                <span className="text-xs font-mono text-silver-muted/50">{timeline.length} events</span>
              </div>
              {timeline.length === 0 ? (
                <div className="flex items-center gap-2 py-2">
                  <CheckCircle size={16} className="text-success/60" />
                  <p className="text-sm text-silver-muted font-medium">No events — timeline will populate with live activity</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-[280px] overflow-y-auto scrollbar-hide">
                  {timeline.map((item) => (
                    <div key={item.id} className={clsx(
                      'flex items-start gap-3 px-3 py-2 rounded-lg transition-colors',
                      item.severity === 'critical' ? 'hover:bg-danger/10' : item.severity === 'warning' ? 'hover:bg-amber/10' : 'hover:bg-charcoal'
                    )}>
                      {item.type === 'Reroute' ? <ArrowsClockwise className="w-4 h-4 text-amber mt-0.5 shrink-0" weight="fill" /> :
                       item.type === 'Alert' ? <WarningCircle className="w-4 h-4 text-amber mt-0.5 shrink-0" weight="fill" /> :
                       <SealCheck className="w-4 h-4 text-success mt-0.5 shrink-0" weight="fill" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-silver">{item.type}</span>
                          <span className="text-xs text-silver-muted/60 font-mono">{formatTimeAgo(item.timestamp)}</span>
                        </div>
                        <p className="text-xs text-silver-muted mt-0.5">
                          {item.label && <span className="font-mono text-amber/80">{item.label} </span>}
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <div className="flex items-center gap-3 text-xs text-silver-muted/40 px-1">
          <span>Last updated: {format(new Date(), 'HH:mm:ss')}</span>
          <span className={clsx('w-1.5 h-1.5 rounded-full', connected ? 'bg-success' : 'bg-danger')} />
          <span>{connected ? 'Live data' : 'Cached data'}</span>
        </div>

      </div>
    </div>
  )
}

export default Executive

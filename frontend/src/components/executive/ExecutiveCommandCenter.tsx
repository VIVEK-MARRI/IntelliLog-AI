import React, { useMemo } from 'react'
import { fleetStore, useOrdersArray } from '@/store/fleetStore'
import { useActivityStore } from '@/store/activityStore'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import clsx from 'clsx'
import { format } from 'date-fns'
import {
  Gauge, MapPin, Warning, Brain, Clock,
  TrendUp, TrendDown, CheckCircle, List, ArrowsClockwise, WarningCircle, SealCheck,
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

const SEVERITY_CONFIG: Record<string, { color: string; dot: string }> = {
  critical: { color: 'border-l-critical bg-critical/5 hover:bg-critical/[0.08]', dot: 'bg-critical' },
  warning: { color: 'border-l-warning bg-warning/5 hover:bg-warning/[0.08]', dot: 'bg-warning' },
  info: { color: 'border-l-border bg-transparent hover:bg-surface-hover', dot: 'bg-text-muted/40' },
  success: { color: 'border-l-success bg-transparent hover:bg-surface-hover', dot: 'bg-success' },
}

export const ExecutiveCommandCenter: React.FC = () => {
  const orders = useOrdersArray()
  const decisions = fleetStore((s) => s.agentDecisions)
  const connectionStatus = fleetStore((s) => s.connectionStatus)
  const events = useActivityStore((s) => s.events)
  const { metrics, fleetHealth } = useDashboardMetrics()

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
    return { activeOrders, highRisk, delayed, totalTimeSaved, successRate, healthScore, interventions }
  }, [orders, decisions, fleetHealth, metrics])

  const criticalItems = useMemo(() => {
    const items: Array<{ id: string; type: 'high_risk' | 'delayed' | 'alert'; severity: number; orderId: string; label: string; detail: string }> = []

    for (const o of orders) {
      if (o.is_high_risk) {
        items.push({
          id: `hr-${o.id}`, type: 'high_risk', severity: o.risk_score,
          orderId: o.id, label: `High-Risk: ${formatOrderId(o.id)}`,
          detail: `Risk ${(o.risk_score * 100).toFixed(0)}% · Driver ${o.driver_id.slice(0, 7)}`,
        })
      }
      if ((o.delay_minutes ?? 0) > 10) {
        items.push({
          id: `dl-${o.id}`, type: 'delayed', severity: Math.min(1, (o.delay_minutes ?? 0) / 60),
          orderId: o.id, label: `Delayed: ${formatOrderId(o.id)}`,
          detail: `${o.delay_minutes} min behind schedule`,
        })
      }
    }

    for (const evt of events) {
      if (evt.severity === 'critical') {
        items.push({
          id: `evt-${evt.id}`, type: 'alert', severity: 1,
          orderId: evt.orderId ?? '', label: evt.title,
          detail: evt.description,
        })
      }
    }

    items.sort((a, b) => b.severity - a.severity)
    return items.slice(0, 10)
  }, [orders, events])

  const aiImpact = useMemo(() => {
    const reroutes = decisions.filter((d) => d.decision_type === 'reroute')
    const timeSaved = reroutes.reduce((s, d) => s + (d.impact?.time_saved_minutes ?? 0), 0)
    const riskReduced = reroutes.reduce((s, d) => s + (d.impact?.risk_reduction ?? 0), 0)
    const successful = decisions.filter((d) => d.outcome === 'success').length
    const rerouteCount = reroutes.length
    const avgTimeSaved = rerouteCount > 0 ? timeSaved / rerouteCount : 0
    const avgRiskReduced = rerouteCount > 0 ? riskReduced / rerouteCount : 0

    return { timeSaved, riskReduced, successful, rerouteCount, avgTimeSaved, avgRiskReduced, totalDecisions: decisions.length }
  }, [decisions])

  const operationalHealth = useMemo(() => {
    const etaDrifted = orders.filter((o) => {
      if (!o.current_eta || !o.planned_eta) return false
      return new Date(o.current_eta).getTime() !== new Date(o.planned_eta).getTime()
    }).length
    const avgDelay = orders.length > 0
      ? orders.reduce((s, o) => s + (o.delay_minutes ?? 0), 0) / orders.length
      : 0
    const onTimeRate = metrics?.on_time_percentage ?? null
    return { etaDrifted, avgDelay, onTimeRate, healthScore: fleetHealth?.score ?? null, healthStatus: fleetHealth?.status ?? null, healthTrend: fleetHealth?.trend ?? 0, eventCount: events.length }
  }, [orders, metrics, fleetHealth, events])

  const timeline = useMemo(() => {
    const items: Array<{ id: string; timestamp: string; type: string; label: string; detail: string; severity: string }> = []

    for (const d of decisions) {
      items.push({
        id: `dec-${d.id}`, timestamp: d.created_at,
        type: d.decision_type === 'reroute' ? 'Reroute' : d.decision_type === 'alert' ? 'Alert' : 'No Action',
        label: formatOrderId(d.order_id),
        detail: d.reasoning.slice(0, 80),
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
    return items.slice(0, 20)
  }, [decisions, events])

  const summary = useMemo(() => {
    const timeSaved = aiImpact.timeSaved
    const rerouteCount = aiImpact.rerouteCount
    const healthScore = operationalHealth.healthScore
    const highRisk = kpi.highRisk
    const activeOrders = kpi.activeOrders
    const successRate = kpi.successRate.toFixed(0)
    const delayedCount = kpi.delayed

    const parts: string[] = []
    if (timeSaved > 0 || rerouteCount > 0) {
      parts.push(`AI interventions prevented an estimated ${timeSaved} minutes of delivery delay today across ${rerouteCount} rerouting actions.`)
    }
    if (healthScore !== null) {
      parts.push(`Fleet health remains ${healthScore >= 80 ? 'strong' : healthScore >= 50 ? 'stable' : 'concerning'} at ${healthScore.toFixed(0)}%,`)
    }
    if (highRisk > 0) {
      parts.push(`with ${highRisk} high-risk shipment${highRisk !== 1 ? 's' : ''} requiring attention.`)
    } else {
      parts.push('with no high-risk shipments currently detected.')
    }
    if (activeOrders > 0) {
      parts.push(`The system is actively managing ${activeOrders} order${activeOrders !== 1 ? 's' : ''} with a ${successRate}% intervention success rate.`)
    }
    if (delayedCount > 0) {
      parts.push(`${delayedCount} order${delayedCount !== 1 ? 's are' : ' is'} currently experiencing delays beyond planned ETA.`)
    } else {
      parts.push('All active orders are on schedule.')
    }

    return parts.join(' ')
  }, [aiImpact, operationalHealth, kpi])

  const connected = connectionStatus === 'connected'
  const reconnecting = connectionStatus === 'connecting' || connectionStatus === 'reconnecting'

  if (orders.length === 0 && decisions.length === 0 && events.length === 0 && !fleetHealth) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <Gauge size={48} className="text-text-muted/20 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Executive Command Center</h2>
          <p className="text-sm text-text-muted/60 mb-6">Loading operational data...</p>
          <div className="flex items-center justify-center gap-2">
            <span className={clsx('w-2 h-2 rounded-full', reconnecting ? 'bg-warning animate-pulse' : 'bg-success animate-pulse')} />
            <span className={clsx('text-xs font-medium', reconnecting ? 'text-warning' : 'text-success')}>
              {reconnecting ? 'Connecting...' : 'Waiting for data'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-8">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Executive Command Center</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {format(new Date(), 'EEEE, MMMM d, yyyy')} ·{' '}
              <span className={clsx('font-medium', connected ? 'text-success' : reconnecting ? 'text-warning' : 'text-critical')}>
                {connected ? 'Live' : reconnecting ? 'Reconnecting...' : 'Offline'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx('w-2 h-2 rounded-full', connected ? 'bg-success animate-pulse' : reconnecting ? 'bg-warning animate-pulse' : 'bg-critical')} />
          </div>
        </div>

        {/* ── BUSINESS IMPACT ── */}
        <section className="bg-surface border border-border rounded-card shadow-card overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
            <Gauge size={16} className="text-accent" weight="fill" />
            <h2 className="text-sm font-semibold text-text-primary tracking-tight">Business Impact</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="relative pl-5 border-l-2 border-accent/40 bg-[rgba(59,130,246,0.04)] rounded-r-lg py-4 pr-5">
              <p className="text-sm text-text-secondary leading-relaxed">{summary}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-background rounded-panel border border-border px-4 py-3">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">Fleet Health</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={clsx(
                    'text-xl font-semibold tracking-tight font-mono',
                    kpi.healthScore !== null && kpi.healthScore >= 80 ? 'text-success' :
                    kpi.healthScore !== null && kpi.healthScore >= 50 ? 'text-warning' :
                    'text-text-primary'
                  )}>
                    {kpi.healthScore !== null ? `${kpi.healthScore.toFixed(0)}%` : '—'}
                  </span>
                  {fleetHealth?.trend ? (
                    <span className={clsx(
                      'text-[10px] font-semibold flex items-center gap-0.5',
                      fleetHealth.trend > 0 ? 'text-success' : 'text-critical'
                    )}>
                      {fleetHealth.trend > 0 ? <TrendUp size={10} /> : <TrendDown size={10} />}
                      {Math.abs(fleetHealth.trend).toFixed(0)}%
                    </span>
                  ) : null}
                </div>
                {fleetHealth?.status && (
                  <p className="text-[10px] text-text-muted mt-0.5 capitalize">{fleetHealth.status}</p>
                )}
              </div>
              <div className="bg-background rounded-panel border border-border px-4 py-3">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">Active Orders</p>
                <p className="text-xl font-semibold tracking-tight font-mono text-text-primary mt-1">{kpi.activeOrders}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{orders.length} total</p>
              </div>
              <div className="bg-background rounded-panel border border-border px-4 py-3">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">On-Time Rate</p>
                <p className="text-xl font-semibold tracking-tight font-mono text-success mt-1">
                  {operationalHealth.onTimeRate !== null ? `${operationalHealth.onTimeRate.toFixed(0)}%` : '—'}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">delivery accuracy</p>
              </div>
              <div className="bg-background rounded-panel border border-border px-4 py-3">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">Time Saved</p>
                <p className="text-xl font-semibold tracking-tight font-mono text-accent mt-1">{kpi.totalTimeSaved}m</p>
                <p className="text-[10px] text-text-muted mt-0.5">by AI interventions</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── RISK EXPOSURE ── */}
        <section className="bg-surface border border-border rounded-card shadow-card overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
            <Warning size={16} className="text-warning" weight="fill" />
            <h2 className="text-sm font-semibold text-text-primary tracking-tight">Risk Exposure</h2>
            {kpi.highRisk > 0 && (
              <span className="text-[10px] font-semibold font-mono text-critical bg-critical/10 px-1.5 py-0.5 rounded-panel">{kpi.highRisk} at risk</span>
            )}
          </div>
          <div className="p-6 space-y-5">
            {kpi.highRisk > 0 && (
              <div className="bg-critical/5 border border-critical/20 rounded-panel px-4 py-3 flex items-center gap-3">
                <Warning size={18} className="text-critical shrink-0" weight="fill" />
                <p className="text-sm text-critical font-medium">
                  {kpi.highRisk} high-risk order{kpi.highRisk !== 1 ? 's' : ''} require{kpi.highRisk === 1 ? 's' : ''} immediate attention
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-background rounded-panel border border-border px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Warning size={14} className="text-text-muted/50" />
                  <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">Orders at Risk</p>
                </div>
                <p className={clsx('text-lg font-bold font-mono', kpi.highRisk > 0 ? 'text-critical' : 'text-success')}>{kpi.highRisk}</p>
              </div>
              <div className="bg-background rounded-panel border border-border px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Clock size={14} className="text-text-muted/50" />
                  <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">Delayed</p>
                </div>
                <p className={clsx('text-lg font-bold font-mono', kpi.delayed > 0 ? 'text-warning' : 'text-text-muted')}>{kpi.delayed}</p>
              </div>
              <div className="bg-background rounded-panel border border-border px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <MapPin size={14} className="text-text-muted/50" />
                  <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">ETA Drifts</p>
                </div>
                <p className={clsx('text-lg font-bold font-mono', operationalHealth.etaDrifted > 0 ? 'text-warning' : 'text-text-muted')}>{operationalHealth.etaDrifted}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">Critical Attention</h4>
                <span className="text-[10px] font-mono text-text-muted bg-surface-hover px-1.5 py-0.5 rounded-panel">{criticalItems.length}</span>
              </div>
              {criticalItems.length === 0 ? (
                <div className="flex items-center gap-2 py-3">
                  <CheckCircle size={16} className="text-success/60" weight="fill" />
                  <p className="text-sm text-text-secondary font-medium">No critical items — all shipments within normal parameters</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {criticalItems.map((item) => (
                    <div key={item.id} className={clsx(
                      'flex items-start gap-3 px-3 py-2.5 rounded-lg border-l-2 transition-colors',
                      item.type === 'high_risk' ? SEVERITY_CONFIG.critical.color : item.type === 'delayed' ? SEVERITY_CONFIG.warning.color : SEVERITY_CONFIG.critical.color
                    )}>
                      <span className={clsx(
                        'w-2 h-2 rounded-full mt-1.5 shrink-0',
                        item.type === 'high_risk' ? 'bg-critical' : item.type === 'delayed' ? 'bg-warning' : 'bg-critical'
                      )} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">{item.label}</span>
                          <span className={clsx(
                            'text-[10px] font-medium px-1.5 py-0.5 rounded',
                            item.type === 'high_risk' ? 'bg-critical/10 text-critical' :
                            item.type === 'delayed' ? 'bg-warning/10 text-warning' :
                            'bg-critical/10 text-critical'
                          )}>
                            {item.type.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {operationalHealth.avgDelay > 0 && (
              <div className="flex items-center justify-between bg-surface-hover rounded-panel px-4 py-2.5 border border-border">
                <span className="text-xs text-text-secondary font-medium">Average delay across fleet</span>
                <span className="text-sm font-semibold font-mono text-warning">{operationalHealth.avgDelay.toFixed(1)} min</span>
              </div>
            )}
          </div>
        </section>

        {/* ── AI IMPACT ── */}
        <section className="bg-surface border border-border rounded-card shadow-card overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
            <Brain size={16} className="text-purple" weight="fill" />
            <h2 className="text-sm font-semibold text-text-primary tracking-tight">AI Impact</h2>
            <span className="text-[10px] font-medium text-purple bg-purple/10 px-1.5 py-0.5 rounded-panel">{aiImpact.totalDecisions} interventions</span>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background rounded-panel border border-border px-4 py-3.5">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">Delay Minutes Prevented</p>
                <p className="text-xl font-bold font-mono text-accent mt-1">{aiImpact.timeSaved}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{aiImpact.rerouteCount} reroute{aiImpact.rerouteCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-background rounded-panel border border-border px-4 py-3.5">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">Avg Route Savings</p>
                <p className="text-xl font-bold font-mono text-success mt-1">{aiImpact.avgTimeSaved > 0 ? `${aiImpact.avgTimeSaved.toFixed(0)}m` : '—'}</p>
                <p className="text-[10px] text-text-muted mt-0.5">per reroute</p>
              </div>
              <div className="bg-background rounded-panel border border-border px-4 py-3.5">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">Successful Interventions</p>
                <p className="text-xl font-bold font-mono text-purple mt-1">{aiImpact.successful}</p>
                <p className="text-[10px] text-text-muted mt-0.5">of {aiImpact.totalDecisions} total</p>
              </div>
              <div className="bg-background rounded-panel border border-border px-4 py-3.5">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.06em]">Risk Reduction</p>
                <p className="text-xl font-bold font-mono text-success mt-1">
                  {aiImpact.avgRiskReduced > 0 ? `-${aiImpact.avgRiskReduced.toFixed(0)}%` : '—'}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">avg per reroute</p>
              </div>
            </div>

            <div className="bg-surface-hover rounded-panel p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-secondary">Intervention Success Rate</span>
                <span className={clsx('text-sm font-semibold font-mono', kpi.successRate >= 80 ? 'text-success' : 'text-warning')}>
                  {kpi.successRate.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all', kpi.successRate >= 80 ? 'bg-success/70' : 'bg-warning/70')}
                  style={{ width: `${Math.min(kpi.successRate, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">Recent Activity</h4>
                <span className="text-[10px] font-mono text-text-muted bg-surface-hover px-1.5 py-0.5 rounded-panel">{timeline.length}</span>
              </div>
              {timeline.length === 0 ? (
                <div className="flex items-center gap-2 py-3">
                  <List size={16} className="text-text-muted/40" />
                  <p className="text-sm text-text-secondary font-medium">No events yet — timeline will populate with live activity</p>
                </div>
              ) : (
                <div className="space-y-0.5 max-h-[280px] overflow-y-auto scrollbar-hide">
                  {timeline.map((item) => (
                    <div key={item.id} className={clsx(
                      'flex items-start gap-3 px-3 py-2 rounded-lg transition-colors',
                      item.severity === 'critical' ? 'hover:bg-critical/5' : item.severity === 'warning' ? 'hover:bg-warning/5' : 'hover:bg-surface-hover'
                    )}>
                      {item.type === 'Reroute' ? <ArrowsClockwise className="w-3.5 h-3.5 text-critical mt-0.5 shrink-0" weight="fill" /> :
                       item.type === 'Alert' ? <WarningCircle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" weight="fill" /> :
                       <SealCheck className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" weight="fill" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-text-primary">{item.type}</span>
                          <span className="text-[10px] text-text-muted font-mono">{formatTimeAgo(item.timestamp)}</span>
                        </div>
                        <p className="text-[11px] text-text-secondary truncate">
                          <span className="font-mono text-text-muted">{item.label}</span> {item.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <div className="flex items-center gap-4 text-[11px] text-text-muted px-1">
          <span>Last updated: {format(new Date(), 'HH:mm:ss')}</span>
          <span className={clsx('w-1.5 h-1.5 rounded-full', connected ? 'bg-success' : 'bg-critical')} />
          <span>{connected ? 'Live data' : 'Cached data'}</span>
        </div>

      </div>
    </div>
  )
}

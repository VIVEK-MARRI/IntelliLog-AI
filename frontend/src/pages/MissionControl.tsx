import React, { useMemo } from 'react'
import { useOrdersArray, useHighRiskOrders, fleetStore } from '@/store/fleetStore'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { useActivityStore } from '@/store/activityStore'
import { DataFreshness } from '@/components/trust'
import {
  WarningCircle, CheckCircle, Robot,
  Crosshair, ArrowsClockwise, SealCheck,
  Brain, TrendUp, List,
} from '@phosphor-icons/react'
import { format } from 'date-fns'
import clsx from 'clsx'

/* ─── Helpers ─── */
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

/* ─── KPI Tile ─── */
function KpiTile({ label, value, sublabel, color }: {
  label: string; value: string | number; sublabel?: string; color?: string
}) {
  return (
    <div className="bg-graphite rounded-card p-4 border border-slate/20">
      <p className="text-xs text-silver-muted font-medium mb-1">{label}</p>
      <p className={clsx('text-2xl font-semibold font-mono tracking-tight', color ?? 'text-silver')}>{value}</p>
      {sublabel && <p className="text-[11px] text-silver-muted/60 mt-0.5">{sublabel}</p>}
    </div>
  )
}

/* ─── AI Recommendation Card ─── */
function AIBriefing() {
  const { recommendations, isLoadingRecommendations } = useDashboardMetrics()

  if (isLoadingRecommendations) {
    return (
      <div className="bg-graphite rounded-card border border-slate/20 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain size={16} className="text-amber" weight="fill" />
          <h2 className="text-lg font-display text-silver">AI Briefing</h2>
        </div>
        <div className="space-y-3">
          <div className="h-20 bg-charcoal rounded-lg animate-pulse" />
          <div className="h-16 bg-charcoal rounded-lg animate-pulse" />
        </div>
      </div>
    )
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="bg-graphite rounded-card border border-slate/20 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Robot size={16} className="text-amber" weight="fill" />
          <h2 className="text-lg font-display text-silver">AI Briefing</h2>
        </div>
        <div className="flex items-center gap-2 py-2">
          <CheckCircle size={18} className="text-success/60" />
          <span className="text-sm text-silver-muted font-medium">No recommendations — fleet operating within normal parameters</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-graphite rounded-card border border-slate/20 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate/20">
        <div className="flex items-center gap-2">
          <Robot size={16} className="text-amber" weight="fill" />
          <h2 className="text-lg font-display text-silver">AI Briefing</h2>
        </div>
        <DataFreshness timestamp={new Date().toISOString()} compact maxAgeMs={120000} />
      </div>
      <div className="p-4 space-y-3">
        {recommendations.slice(0, 3).map((rec) => (
          <div key={rec.id} className="bg-charcoal rounded-lg p-4 border border-slate/20">
            <div className="flex items-start gap-3">
              <span className={clsx(
                'w-2 h-2 rounded-full mt-1.5 shrink-0',
                rec.priority === 'critical' ? 'bg-danger' :
                rec.priority === 'high' ? 'bg-amber' : 'bg-silver-muted/50'
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-silver">{rec.title}</span>
                  <span className={clsx(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider',
                    rec.priority === 'critical' ? 'bg-danger/20 text-danger' :
                    rec.priority === 'high' ? 'bg-amber/20 text-amber' :
                    'bg-silver-muted/20 text-silver-muted'
                  )}>
                    {rec.priority}
                  </span>
                </div>
                <p className="text-xs text-silver-muted leading-relaxed">{rec.description}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-[11px] text-silver-muted/60">
                    Confidence <span className="text-silver font-medium">{(rec.confidence * 100).toFixed(0)}%</span>
                  </span>
                  {rec.estimated_impact_percentage > 0 && (
                    <span className="text-[11px] text-silver-muted/60">
                      Impact <span className="text-success font-medium">+{rec.estimated_impact_percentage}%</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Activity Stream ─── */
function ActivityTimeline() {
  const decisions = fleetStore((s) => s.agentDecisions)
  const events = useActivityStore((s) => s.events)

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
    return items.slice(0, 20)
  }, [decisions, events])

  if (timeline.length === 0) {
    return (
      <div className="bg-graphite rounded-card border border-slate/20 p-5">
        <div className="flex items-center gap-2 mb-1">
          <List size={16} className="text-silver-muted" />
          <h2 className="text-lg font-display text-silver">Activity Stream</h2>
        </div>
        <p className="text-sm text-silver-muted">No events yet — activity will appear as the fleet operates</p>
      </div>
    )
  }

  return (
    <div className="bg-graphite rounded-card border border-slate/20 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate/20">
        <List size={16} className="text-silver-muted" />
        <h2 className="text-lg font-display text-silver">Activity Stream</h2>
        <span className="ml-auto text-xs font-mono text-silver-muted/50">{timeline.length} events</span>
      </div>
      <div className="divide-y divide-slate/10 max-h-[320px] overflow-y-auto">
        {timeline.map((item) => (
          <div key={item.id} className="flex items-start gap-3 px-5 py-3 hover:bg-charcoal/40 transition-colors">
            {item.type === 'Reroute' ? (
              <ArrowsClockwise className="w-4 h-4 text-amber mt-0.5 shrink-0" weight="fill" />
            ) : item.type === 'Alert' ? (
              <WarningCircle className="w-4 h-4 text-amber mt-0.5 shrink-0" weight="fill" />
            ) : (
              <SealCheck className="w-4 h-4 text-success mt-0.5 shrink-0" weight="fill" />
            )}
            <div className="flex-1 min-w-0">
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
    </div>
  )
}

/* ─── Main Page ─── */
export const MissionControl: React.FC = () => {
  const connectionStatus = fleetStore((s) => s.connectionStatus)
  const ordersArray = useOrdersArray()
  const highRiskOrders = useHighRiskOrders()
  const decisions = fleetStore((s) => s.agentDecisions)
  const { metrics, fleetHealth } = useDashboardMetrics()

  const isConnected = connectionStatus === 'connected'
  const isConnecting = connectionStatus === 'connecting' || connectionStatus === 'reconnecting'

  const kpi = useMemo(() => {
    const activeOrders = ordersArray.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length
    const delayed = ordersArray.filter((o) => (o.delay_minutes ?? 0) > 0).length
    const avgDelay = ordersArray.length > 0
      ? ordersArray.reduce((s, o) => s + (o.delay_minutes ?? 0), 0) / ordersArray.length
      : 0
    const totalTimeSaved = decisions.reduce((s, d) => s + (d.impact?.time_saved_minutes ?? 0), 0)
    const onTimeRate = metrics?.on_time_percentage ?? null
    const healthScore = fleetHealth?.score ?? null
    const interventions = metrics?.agent_interventions ?? decisions.length
    return { activeOrders, delayed, avgDelay, totalTimeSaved, onTimeRate, healthScore, interventions }
  }, [ordersArray, decisions, metrics, fleetHealth])

  return (
    <div className="h-full flex flex-col gap-4 p-page overflow-y-auto bg-charcoal">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card bg-amber/20 flex items-center justify-center">
            <Crosshair size={18} weight="fill" className="text-amber" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-silver tracking-tight">Mission Control</h1>
            <p className="text-xs text-silver-muted/60 font-medium">Stacked Briefing · {format(new Date(), 'EEEE, MMMM d')}</p>
          </div>
        </div>
        <span className={clsx(
          'text-xs font-medium flex items-center gap-1.5',
          isConnected ? 'text-success' : isConnecting ? 'text-amber' : 'text-danger'
        )}>
          <span className={clsx(
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-success' : isConnecting ? 'bg-amber animate-pulse' : 'bg-danger'
          )} />
          {isConnected ? 'Live' : isConnecting ? 'Reconnecting...' : 'Offline'}
        </span>
      </div>

      {/* ─── Connection Banner ─── */}
      {!isConnected && (
        <div className={clsx(
          'flex items-center justify-center gap-2 px-4 py-2.5 rounded-card text-sm font-medium shrink-0',
          isConnecting
            ? 'bg-amber/10 border border-amber/30 text-amber'
            : 'bg-danger/10 border border-danger/30 text-danger'
        )}>
          <span className={`w-2 h-2 rounded-full ${isConnecting ? 'bg-amber animate-pulse' : 'bg-danger'}`} />
          {isConnecting ? 'Reconnecting — live data may be delayed' : 'Disconnected — showing cached data'}
        </div>
      )}

      {/* ─── 1. Attention Strip ─── */}
      <div className="bg-graphite rounded-card border border-slate/20 p-4">
        <div className="flex items-center gap-2 mb-3">
          <WarningCircle size={16} className="text-amber" weight="fill" />
          <h2 className="text-sm font-semibold text-silver tracking-tight">Attention Required</h2>
          {highRiskOrders.length > 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-danger bg-danger/20 px-2 py-0.5 rounded">
              <WarningCircle size={12} weight="fill" />
              {highRiskOrders.length} high-risk
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-3">
          <KpiTile
            label="High Risk"
            value={highRiskOrders.length}
            sublabel={highRiskOrders.length > 0 ? 'requires immediate attention' : 'all clear'}
            color={highRiskOrders.length > 0 ? 'text-danger' : 'text-success'}
          />
          <KpiTile
            label="Delayed"
            value={kpi.delayed}
            sublabel={`avg ${kpi.avgDelay.toFixed(1)}m behind`}
            color={kpi.delayed > 0 ? 'text-amber' : 'text-silver-muted'}
          />
          <KpiTile
            label="Active Orders"
            value={kpi.activeOrders}
            sublabel={`${ordersArray.length} total in system`}
          />
          <KpiTile
            label="AI Interventions Today"
            value={kpi.interventions}
            sublabel={`${kpi.totalTimeSaved}m delay prevented`}
            color="text-amber"
          />
        </div>
      </div>

      {/* ─── 2. AI Briefing ─── */}
      <AIBriefing />

      {/* ─── 3. Fleet Status ─── */}
      <div className="bg-graphite rounded-card border border-slate/20 p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendUp size={16} className="text-amber" weight="fill" />
          <h2 className="text-lg font-display text-silver">Fleet Status</h2>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <KpiTile
            label="Fleet Health"
            value={kpi.healthScore !== null ? `${kpi.healthScore.toFixed(0)}%` : '—'}
            sublabel={fleetHealth?.status ? fleetHealth.status.replace('_', ' ') : 'awaiting data'}
            color={kpi.healthScore !== null && kpi.healthScore >= 80 ? 'text-success' : kpi.healthScore !== null && kpi.healthScore >= 50 ? 'text-amber' : 'text-silver'}
          />
          <KpiTile
            label="On-Time Rate"
            value={kpi.onTimeRate !== null ? `${kpi.onTimeRate.toFixed(0)}%` : '—'}
            sublabel="delivery accuracy"
            color="text-success"
          />
          <KpiTile
            label="Delay Minutes Prevented"
            value={kpi.totalTimeSaved}
            sublabel="by AI rerouting"
            color="text-amber"
          />
          <KpiTile
            label="Fleet Size"
            value={ordersArray.length}
            sublabel="active shipments"
          />
        </div>
      </div>

      {/* ─── 4. Activity Stream ─── */}
      <ActivityTimeline />
    </div>
  )
}

export default MissionControl

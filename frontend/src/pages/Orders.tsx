import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fleetStore, useOrdersArray } from '@/store/fleetStore'
import { predictionsAPI } from '@/api/predictions'
import { routesAPI } from '@/api/routes'
import { agentAPI } from '@/api/agent'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import {
  MagnifyingGlass, X, MapPin, Truck, Clock,
  Warning, WarningCircle, SealCheck, Brain, Lightbulb,
  ArrowsClockwise, ArrowRight, Circle,
} from '@phosphor-icons/react'

/* ─── Helpers ─── */
const formatId = (id: string): string => (id.length > 7 ? id.slice(0, 7).toUpperCase() : id.toUpperCase())

const riskLabel = (score: number) => score >= 0.7 ? 'Critical' : score >= 0.3 ? 'At Risk' : 'Low'

const riskColor = (score: number) => score >= 0.7 ? 'text-danger' : score >= 0.3 ? 'text-amber' : 'text-success'

const statusColor: Record<string, string> = {
  completed: 'text-success bg-success/10 border-success/30',
  delivered: 'text-success bg-success/10 border-success/30',
  in_transit: 'text-amber bg-amber/10 border-amber/30',
  in_progress: 'text-silver bg-graphite border-slate/30',
  pending: 'text-silver-muted bg-charcoal border-slate/20',
  cancelled: 'text-danger bg-danger/10 border-danger/30',
  failed: 'text-danger bg-danger/10 border-danger/30',
}

/* ======================================================================== */
/*  LEFT: ORDER QUEUE                                                       */
/* ======================================================================== */
function OrderQueue({
  orders,
  selectedId,
  onSelect,
}: {
  orders: typeof fleetStore extends { getState: () => { orders: Map<string, any> } } ? any[] : any[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'delayed' | 'highRisk'>('all')

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (query && !o.id.toLowerCase().includes(query.toLowerCase()) && !o.driver_id?.toLowerCase().includes(query.toLowerCase())) return false
      switch (filter) {
        case 'active': if (o.status === 'completed' || o.status === 'cancelled') return false; break
        case 'delayed': if ((o.delay_minutes ?? 0) <= 0) return false; break
        case 'highRisk': if (!o.is_high_risk) return false; break
      }
      return true
    })
  }, [orders, query, filter])

  return (
    <div className="flex flex-col h-full bg-charcoal">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-slate/20">
        <h2 className="text-sm font-semibold text-silver">Order Queue</h2>
        <p className="text-[11px] text-silver-muted">{filtered.length} orders</p>
      </div>

      {/* Search */}
      <div className="shrink-0 px-4 py-2">
        <div className="relative">
          <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-silver-muted pointer-events-none" weight="bold" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ID or driver..."
            className="w-full bg-graphite border border-slate/20 rounded-lg text-xs text-silver pl-8 pr-7 py-1.5 outline-none focus:border-amber/40 focus:ring-1 focus:ring-amber/20 placeholder:text-silver-muted/60 transition-all"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-silver-muted hover:text-silver">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 px-4 py-1.5 flex items-center gap-1.5 flex-wrap">
        {(['all', 'active', 'delayed', 'highRisk'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all',
              filter === f
                ? 'bg-amber/15 text-amber border border-amber/20'
                : 'text-silver-muted hover:text-silver bg-graphite border border-slate/20',
            )}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'delayed' ? 'Delayed' : 'High Risk'}
          </button>
        ))}
      </div>

      {/* Order list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center px-4">
            <div>
              <Circle size={20} className="text-silver-muted/30 mx-auto mb-2" />
              <p className="text-xs text-silver-muted">
                {query ? 'No orders match search' : 'No orders available'}
              </p>
            </div>
          </div>
        ) : (
          filtered.map((order) => (
            <button
              key={order.id}
              onClick={() => onSelect(selectedId === order.id ? null : order.id)}
              className={clsx(
                'w-full text-left px-3 py-2.5 rounded-lg border transition-all',
                selectedId === order.id
                  ? 'bg-amber/10 border-amber/30 shadow-[0_0_0_1px_rgba(244,197,66,0.2)]'
                  : 'bg-graphite border-slate/20 hover:border-slate/30 hover:bg-graphite/80',
              )}
            >
              {/* Top row: ID + risk badge */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-sm font-semibold text-silver tracking-tight">{formatId(order.id)}</span>
                <span className={clsx('text-[11px] font-bold font-mono', riskColor(order.risk_score))}>
                  {(order.risk_score * 100).toFixed(0)}%
                </span>
              </div>
              {/* Middle row: driver + ETA */}
              <div className="flex items-center gap-2 text-[11px] text-silver-muted mb-1.5">
                <Truck size={11} className="shrink-0" />
                <span className="truncate">{order.driver_id?.slice(0, 8) || 'Unassigned'}</span>
                <span className="text-slate/30">·</span>
                <Clock size={11} className="shrink-0" />
                <span>{order.current_eta ? format(new Date(order.current_eta), 'HH:mm') : '--:--'}</span>
              </div>
              {/* Bottom row: status + delay */}
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                  statusColor[order.status] || 'text-silver-muted bg-graphite border-slate/20',
                )}>
                  {order.status.replace('_', ' ')}
                </span>
                {(order.delay_minutes ?? 0) > 0 && (
                  <span className="text-[10px] text-danger font-medium">+{Math.round(order.delay_minutes)}m</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/* ======================================================================== */
/*  CENTER: INVESTIGATION WORKSPACE                                         */
/* ======================================================================== */
function InvestigationWorkspace({
  orderId,
}: {
  orderId: string | null
}) {
  const order = useMemo(() => {
    const orders = useOrdersArray()
    return orders.find((o) => o.id === orderId) ?? null
  }, [orderId])

  // Hooks for API data
  const predictionQuery = useQuery({
    queryKey: ['predictions', orderId],
    queryFn: () => predictionsAPI.getPrediction(orderId!),
    enabled: !!orderId,
    staleTime: 15000,
  })
  const decisionsQuery = useQuery({
    queryKey: ['agent', 'decisions', orderId],
    queryFn: () => agentAPI.getOrderDecisions(orderId!),
    enabled: !!orderId,
    staleTime: 30000,
  })
  const routeQuery = useQuery({
    queryKey: ['route', 'current', orderId],
    queryFn: () => routesAPI.getCurrentRoute(orderId!),
    enabled: !!orderId,
    staleTime: 30000,
  })
  const historyQuery = useQuery({
    queryKey: ['route', 'history', orderId],
    queryFn: () => routesAPI.getRouteHistory(orderId!),
    enabled: !!orderId,
    staleTime: 30000,
  })

  const prediction = predictionQuery.data
  const decisions = decisionsQuery.data?.decisions ?? []
  const route = routeQuery.data
  const routeHistory = historyQuery.data ?? []
  const riskScore = order ? order.risk_score * 100 : (prediction?.risk_score ?? 0) * 100

  if (!orderId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-graphite">
        <div className="text-center">
          <MapPin size={36} className="text-silver-muted/20 mx-auto mb-3" weight="thin" />
          <p className="text-base font-display text-silver">Select an order to investigate</p>
          <p className="text-sm text-silver-muted mt-1">Choose an order from the queue on the left.</p>
        </div>
      </div>
    )
  }

  const isLoading = predictionQuery.isLoading || decisionsQuery.isLoading

  return (
    <div className="flex-1 flex flex-col bg-graphite overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-slate/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber/15 flex items-center justify-center">
            <MapPin size={14} weight="fill" className="text-amber" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-silver font-mono tracking-tight">{formatId(orderId)}</h2>
            {order && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className={clsx(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                  statusColor[order.status] || 'text-silver-muted bg-graphite border-slate/20',
                )}>
                  {order.status.replace('_', ' ')}
                </span>
                <span className="text-[11px] text-silver-muted">{order.driver_id?.slice(0, 8)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable investigation body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {isLoading && !order ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-5 w-32 bg-charcoal rounded" />
            <div className="h-3 w-full bg-charcoal rounded" />
            <div className="h-3 w-3/4 bg-charcoal rounded" />
            <div className="h-20 w-full bg-charcoal rounded" />
          </div>
        ) : (
          <>
            {/* ── Order Summary ── */}
            {order && (
              <div className="flex items-center gap-4 text-xs text-silver-muted bg-charcoal rounded-lg p-3.5 border border-slate/20">
                <div>
                  <span className="text-[10px] text-silver-muted/60 uppercase tracking-wider block">Origin</span>
                  <span className="text-silver font-medium">{order.origin ?? 'N/A'}</span>
                </div>
                <ArrowRight size={14} className="text-amber shrink-0" />
                <div>
                  <span className="text-[10px] text-silver-muted/60 uppercase tracking-wider block">Destination</span>
                  <span className="text-silver font-medium">{order.destination ?? 'N/A'}</span>
                </div>
              </div>
            )}

            {/* ── Risk Score ── */}
            <section>
              <h3 className="text-xs font-semibold text-silver-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Warning size={12} className="text-amber" weight="fill" />
                Risk Score
              </h3>
              <div className="bg-charcoal rounded-lg p-4 border border-slate/20">
                <div className="flex items-center gap-4">
                  <span className={clsx('text-3xl font-bold font-mono', riskColor(order?.risk_score ?? 0))}>
                    {Math.round(riskScore)}%
                  </span>
                  <div className="flex-1 h-2 bg-graphite rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all', riskScore > 70 ? 'bg-danger' : riskScore > 30 ? 'bg-amber' : 'bg-success')}
                      style={{ width: `${Math.min(riskScore, 100)}%` }}
                    />
                  </div>
                  <span className={clsx('text-sm font-medium', riskColor(order?.risk_score ?? 0))}>
                    {riskLabel(order?.risk_score ?? 0)}
                  </span>
                </div>
                {prediction && (
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-silver-muted">
                    <span>Confidence: {(prediction.confidence * 100).toFixed(0)}%</span>
                    <span className="text-slate/30">·</span>
                    <span>Model: v{prediction.model_version}</span>
                    {prediction.cached && (
                      <>
                        <span className="text-slate/30">·</span>
                        <span className="text-amber/60">cached</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ── ETA Analysis ── */}
            {order && (
              <section>
                <h3 className="text-xs font-semibold text-silver-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock size={12} className="text-silver-muted" />
                  ETA Analysis
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-charcoal rounded-lg p-3.5 border border-slate/20">
                    <span className="text-[10px] text-silver-muted/60 uppercase tracking-wider">Estimated Arrival</span>
                    <p className="text-lg font-semibold font-mono text-silver mt-0.5">
                      {order.current_eta ? format(new Date(order.current_eta), 'HH:mm') : '--:--'}
                    </p>
                  </div>
                  <div className="bg-charcoal rounded-lg p-3.5 border border-slate/20">
                    <span className="text-[10px] text-silver-muted/60 uppercase tracking-wider">Delay</span>
                    <p className={clsx('text-lg font-semibold font-mono mt-0.5', (order.delay_minutes ?? 0) > 0 ? 'text-danger' : 'text-success')}>
                      {(order.delay_minutes ?? 0) > 0 ? `+${Math.round(order.delay_minutes)}m` : 'On time'}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* ── Route Analysis ── */}
            {route && (
              <section>
                <h3 className="text-xs font-semibold text-silver-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Truck size={12} className="text-silver-muted" />
                  Route Analysis
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-charcoal rounded-lg p-3 border border-slate/20">
                    <span className="text-[10px] text-silver-muted/60 uppercase tracking-wider">Distance</span>
                    <p className="text-sm font-semibold font-mono text-silver mt-0.5">{route.total_distance_km?.toFixed(1) ?? '—'} km</p>
                  </div>
                  <div className="bg-charcoal rounded-lg p-3 border border-slate/20">
                    <span className="text-[10px] text-silver-muted/60 uppercase tracking-wider">Duration</span>
                    <p className="text-sm font-semibold font-mono text-silver mt-0.5">{Math.round(route.total_duration_minutes ?? 0)} min</p>
                  </div>
                  <div className="bg-charcoal rounded-lg p-3 border border-slate/20">
                    <span className="text-[10px] text-silver-muted/60 uppercase tracking-wider">Stops</span>
                    <p className="text-sm font-semibold font-mono text-silver mt-0.5">{route.waypoints?.length ?? 0}</p>
                  </div>
                </div>
              </section>
            )}

            {/* ── Timeline ── */}
            <section>
              <h3 className="text-xs font-semibold text-silver-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock size={12} className="text-silver-muted" />
                Timeline
              </h3>
              <div className="bg-charcoal rounded-lg p-4 border border-slate/20">
                {order ? (
                  <div className="relative pl-5 ml-0.5 space-y-3">
                    <div className="absolute left-[3px] top-2 bottom-2 w-px bg-slate/20" />
                    {[
                      { time: order.created_at, label: 'Order Created', type: 'created' },
                      ...(order.status === 'in_progress' || order.status === 'in_transit'
                        ? [{ time: order.updated_at, label: order.status === 'in_transit' ? 'In Transit' : 'In Progress', type: 'progress' as const }]
                        : []),
                      ...((order.delay_minutes ?? 0) > 0
                        ? [{ time: order.updated_at, label: `Delay Detected (+${Math.round(order.delay_minutes)}m)`, type: 'delay' as const }]
                        : []),
                      ...(order.status === 'completed'
                        ? [{ time: order.updated_at, label: 'Delivered', type: 'completed' as const }]
                        : []),
                    ].map((evt, i) => (
                      <div key={i} className="relative">
                        <span className={clsx(
                          'absolute -left-[13px] top-1 w-2 h-2 rounded-full border-2 border-graphite',
                          evt.type === 'created' ? 'bg-amber' :
                          evt.type === 'completed' ? 'bg-success' :
                          evt.type === 'delay' ? 'bg-danger' : 'bg-silver-muted',
                        )} />
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-medium text-silver">{evt.label}</span>
                          </div>
                          <span className="text-[10px] text-silver-muted/50 font-mono shrink-0 ml-2">{format(new Date(evt.time), 'HH:mm')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-silver-muted/60">No timeline data</p>
                )}
              </div>
            </section>

            {/* ── Agent Decisions ── */}
            <section>
              <h3 className="text-xs font-semibold text-silver-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Brain size={12} className="text-silver-muted" />
                Agent Decisions
              </h3>
              <div className="space-y-1.5">
                {decisions.length === 0 && routeHistory.length === 0 ? (
                  <p className="text-xs text-silver-muted/60 bg-charcoal rounded-lg p-3 border border-slate/20">No decisions recorded yet</p>
                ) : (
                  <>
                    {decisions.slice(0, 5).map((d: any, i: number) => (
                      <div key={d.decisionId || i} className="bg-charcoal rounded-lg p-3 border border-slate/20">
                        <div className="flex items-start gap-2.5">
                          <span className={clsx(
                            'w-1.5 h-1.5 rounded-full mt-1 shrink-0',
                            d.decision_type === 'reroute' ? 'bg-danger' : d.decision_type === 'alert' ? 'bg-amber' : 'bg-silver-muted',
                          )} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-silver capitalize">{d.decision_type?.replace('_', ' ')}</span>
                              <span className="text-[10px] text-silver-muted/50 font-mono">
                                {format(new Date(d.created_at || d.timestamp), 'HH:mm')}
                              </span>
                              {d.outcome && (
                                <span className={clsx(
                                  'text-[10px] font-medium px-1 py-0.5 rounded',
                                  d.outcome === 'success' ? 'bg-success/10 text-success' : 'bg-amber/10 text-amber',
                                )}>
                                  {d.outcome}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-silver-muted mt-0.5">{d.reasoning}</p>
                            {d.impact?.time_saved_minutes > 0 && (
                              <span className="text-[10px] text-success mt-1 block">-{d.impact.time_saved_minutes} min saved</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {routeHistory.slice(0, 2).map((entry: any, i: number) => (
                      <div key={entry.route_plan_id || i} className="bg-charcoal rounded-lg p-3 border border-slate/20 flex items-center justify-between text-[11px]">
                        <span className="text-silver-muted font-mono">{format(new Date(entry.created_at), 'MMM dd HH:mm')}</span>
                        <span className="text-silver font-mono">{entry.total_distance_km?.toFixed(1)} km</span>
                        <span className="text-silver font-mono">{Math.round(entry.total_duration_minutes ?? 0)} min</span>
                        <span className="text-silver-muted">{entry.solver_status}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

/* ======================================================================== */
/*  RIGHT: AI COPILOT                                                       */
/* ======================================================================== */
function AICopilot({
  orderId,
  prediction,
  decisions,
}: {
  orderId: string | null
  prediction: any
  decisions: any[]
}) {
  const orders = useOrdersArray()
  const order = orderId ? orders.find((o) => o.id === orderId) : null

  if (!orderId || !order) {
    return (
      <div className="flex-1 flex items-center justify-center bg-charcoal">
        <div className="text-center px-4">
          <Lightbulb size={28} className="text-silver-muted/20 mx-auto mb-2" weight="thin" />
          <p className="text-xs text-silver-muted">Select an order to view AI analysis</p>
        </div>
      </div>
    )
  }

  const factors = prediction?.topRiskFactors ?? []
  const lastDecision = decisions?.[decisions.length - 1]
  const isHighRisk = order.risk_score >= 0.7

  return (
    <div className="flex-1 flex flex-col bg-charcoal overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3.5 border-b border-slate/20 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-amber/15 flex items-center justify-center">
          <Lightbulb size={13} weight="fill" className="text-amber" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-silver">AI Copilot</h2>
          <p className="text-[10px] text-silver-muted">Intelligence summary</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Root Cause */}
        <section>
          <h3 className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Warning size={11} className="text-amber" />
            Root Cause
          </h3>
          {factors.length > 0 ? (
            <div className="space-y-1.5">
              {factors.slice(0, 3).map((f: any, i: number) => (
                <div key={i} className="bg-graphite rounded-lg p-3 border border-slate/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-silver font-medium truncate">{f.humanReadable}</span>
                    <span className={clsx(
                      'text-[11px] font-bold font-mono',
                      f.direction === 'increases' ? 'text-danger' : 'text-success',
                    )}>
                      {f.direction === 'increases' ? '+' : ''}{f.contribution?.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[10px] text-silver-muted">
                    {f.direction === 'increases' ? 'Increases risk' : 'Decreases risk'} · Value: {f.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-silver-muted/60 bg-graphite rounded-lg p-3 border border-slate/20">
              {isHighRisk ? 'Analyzing root causes...' : 'No significant risk factors identified.'}
            </p>
          )}
        </section>

        {/* Recommendation */}
        <section>
          <h3 className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Brain size={11} className="text-amber" />
            Recommendation
          </h3>
          <div className={clsx(
            'rounded-lg p-3.5 border',
            isHighRisk
              ? 'bg-danger/10 border-danger/30'
              : 'bg-amber/10 border-amber/30',
          )}>
            <div className="flex items-start gap-2">
              {isHighRisk ? (
                <WarningCircle size={14} className="text-danger shrink-0 mt-0.5" weight="fill" />
              ) : (
                <SealCheck size={14} className="text-success shrink-0 mt-0.5" weight="fill" />
              )}
              <div>
                <p className="text-sm font-medium text-silver">
                  {isHighRisk
                    ? 'Urgent: Reroute recommended'
                    : 'Order is on track'}
                </p>
                <p className="text-xs text-silver-muted mt-1">
                  {isHighRisk
                    ? `High risk score (${(order.risk_score * 100).toFixed(0)}%) requires immediate route review. Consider rerouting to avoid delays.`
                    : 'Current route is performing within acceptable parameters. No immediate action required.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Expected Impact */}
        {lastDecision?.impact && (
          <section>
            <h3 className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ArrowsClockwise size={11} className="text-amber" />
              Expected Impact
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {lastDecision.impact.time_saved_minutes > 0 && (
                <div className="bg-graphite rounded-lg p-3 border border-slate/20">
                  <span className="text-[10px] text-silver-muted/60 uppercase tracking-wider">Time Saved</span>
                  <p className="text-lg font-bold font-mono text-success mt-0.5">-{lastDecision.impact.time_saved_minutes}m</p>
                </div>
              )}
              {lastDecision.impact.cost_saved > 0 && (
                <div className="bg-graphite rounded-lg p-3 border border-slate/20">
                  <span className="text-[10px] text-silver-muted/60 uppercase tracking-wider">Cost Saved</span>
                  <p className="text-lg font-bold font-mono text-success mt-0.5">${lastDecision.impact.cost_saved}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Confidence */}
        {prediction && (
          <section>
            <h3 className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider mb-2">Model Confidence</h3>
            <div className="bg-graphite rounded-lg p-3 border border-slate/20">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-silver-muted">Prediction confidence</span>
                <span className="text-xs font-bold text-amber font-mono">{(prediction.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full h-1.5 bg-charcoal rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber transition-all"
                  style={{ width: `${Math.min(prediction.confidence * 100, 100)}%` }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Available Actions */}
        <section>
          <h3 className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider mb-2">Available Actions</h3>
          <div className="space-y-2">
            <button className="w-full text-left px-3.5 py-2.5 bg-amber text-charcoal font-semibold rounded-lg hover:bg-amber/90 transition text-sm">
              Reroute Order
            </button>
            <button className="w-full text-left px-3.5 py-2.5 bg-graphite border border-slate/20 text-silver rounded-lg hover:bg-graphite/80 transition text-sm">
              Contact Driver
            </button>
            <button className="w-full text-left px-3.5 py-2.5 bg-graphite border border-slate/20 text-silver rounded-lg hover:bg-graphite/80 transition text-sm">
              Escalate to Supervisor
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ======================================================================== */
/*  MAIN ORDERS PAGE                                                        */
/* ======================================================================== */
export const Orders: React.FC = () => {
  const orders = useOrdersArray()
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)

  // Fetch prediction + decisions for the AI Copilot
  const predictionQuery = useQuery({
    queryKey: ['predictions', detailOrderId],
    queryFn: () => predictionsAPI.getPrediction(detailOrderId!),
    enabled: !!detailOrderId,
    staleTime: 15000,
  })
  const decisionsQuery = useQuery({
    queryKey: ['agent', 'decisions', detailOrderId],
    queryFn: () => agentAPI.getOrderDecisions(detailOrderId!),
    enabled: !!detailOrderId,
    staleTime: 30000,
  })

  return (
    <div className="h-full flex flex-col bg-charcoal overflow-hidden">
      {/* Page header */}
      <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-slate/20 bg-charcoal">
        <div className="w-8 h-8 rounded-lg bg-amber/15 flex items-center justify-center">
          <MapPin size={14} weight="fill" className="text-amber" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-silver tracking-tight">Orders</h1>
          <p className="text-[10px] text-silver-muted font-medium tracking-widest uppercase">Investigation Workspace</p>
        </div>
      </header>

      {/* Three-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT 25% — Order Queue */}
        <div className="w-[25%] min-w-[260px] border-r border-slate/20">
          <OrderQueue
            orders={orders}
            selectedId={detailOrderId}
            onSelect={setDetailOrderId}
          />
        </div>

        {/* CENTER 50% — Investigation Workspace */}
        <div className="flex-1 min-w-0 border-r border-slate/20">
          <InvestigationWorkspace
            orderId={detailOrderId}
          />
        </div>

        {/* RIGHT 25% — AI Copilot */}
        <div className="w-[25%] min-w-[240px]">
          <AICopilot
            orderId={detailOrderId}
            prediction={predictionQuery.data}
            decisions={decisionsQuery.data?.decisions ?? []}
          />
        </div>
      </div>
    </div>
  )
}

export default Orders

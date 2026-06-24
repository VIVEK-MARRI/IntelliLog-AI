import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { routesAPI } from '@/api/routes'
import { fleetStore, useOrdersArray } from '@/store/fleetStore'
import { Route, RefreshCw, Clock, Fuel, Gauge, History, MapPin, Layers, CheckCircle, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { format } from 'date-fns'

const SOLVER_CONFIDENCE: Record<string, { label: string; color: string; pct: number }> = {
  optimal: { label: 'High', color: 'text-success bg-success-bg border-success-border', pct: 95 },
  feasible: { label: 'Medium', color: 'text-warning bg-warning-bg border-warning-border', pct: 75 },
  heuristic: { label: 'Low', color: 'text-mist bg-navy border-steel-grey', pct: 55 },
  unknown: { label: 'Unknown', color: 'text-mist/60 bg-navy border-steel-grey', pct: 0 },
}

const FUEL_PER_KM = 0.185

const formatOrderId = (id: string): string => id.length > 7 ? id.slice(0, 7).toUpperCase() : id.toUpperCase()

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  highlight?: 'positive' | 'negative' | 'neutral'
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, sub, icon, highlight = 'neutral' }) => (
  <div className={clsx(
    'bg-navy/50 border rounded-lg p-3',
    highlight === 'positive' ? 'border-success/30' : highlight === 'negative' ? 'border-critical/30' : 'border-steel-grey/20'
  )}>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[10px] font-medium text-mist uppercase tracking-wider">{label}</span>
      <span className={clsx(
        highlight === 'positive' && 'text-success',
        highlight === 'negative' && 'text-critical',
        highlight === 'neutral' && 'text-mist'
      )}>
        {icon}
      </span>
    </div>
    <p className="text-lg font-bold font-mono text-pearl">{value}</p>
    {sub && <p className="text-[10px] text-mist/60 mt-0.5">{sub}</p>}
  </div>
)

const StopSequence: React.FC<{ current: number[]; optimized: number[] | null }> = ({ current, optimized }) => {
  const maxStops = Math.max(current.length, optimized?.length ?? 0)
  if (maxStops === 0) return <p className="text-xs text-mist/60">No stops data</p>

  return (
    <div className="space-y-2">
      {Array.from({ length: maxStops }).map((_, idx) => {
        const origIdx = current.indexOf(idx + 1)
        const optIdx = optimized ? optimized.indexOf(idx + 1) : -1
        const changed = optimized && origIdx !== optIdx
        const origPos = origIdx >= 0 ? `${origIdx + 1}` : '—'
        const optPos = optIdx >= 0 ? `${optIdx + 1}` : '—'

        return (
          <div key={idx} className="flex items-center gap-2 text-[11px]">
            <span className="w-5 text-right font-mono text-mist/50">{idx + 1}.</span>
            <MapPin className="w-3 h-3 text-mist/40" />
            <span className="flex-1 text-cloud truncate">Stop {idx + 1}</span>
            <span className="font-mono text-mist/60 w-6 text-center">{origPos}</span>
            {optimized && (
              <span className={clsx(
                'font-mono w-6 text-center',
                changed ? 'text-accent font-semibold' : 'text-mist/40'
              )}>
                {optPos}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export const RouteOptimizationCenter: React.FC = () => {
  const orders = useOrdersArray()
  const selectedOrderId = fleetStore((s) => s.selectedOrderId)

  const [targetOrderId, setTargetOrderId] = useState<string | null>(null)
  const [showBefore, setShowBefore] = useState(false)
  const [pollingJobId, setPollingJobId] = useState<string | null>(null)

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled'),
    [orders]
  )
  const effectiveOrderId = targetOrderId || selectedOrderId

  useEffect(() => {
    if (selectedOrderId && !targetOrderId) {
      setTargetOrderId(selectedOrderId)
    }
  }, [selectedOrderId, targetOrderId])

  const currentRouteQuery = useQuery({
    queryKey: ['route', 'current', effectiveOrderId],
    queryFn: () => routesAPI.getCurrentRoute(effectiveOrderId!),
    enabled: !!effectiveOrderId,
    staleTime: 30000,
  })

  const historyQuery = useQuery({
    queryKey: ['route', 'history', effectiveOrderId],
    queryFn: () => routesAPI.getRouteHistory(effectiveOrderId!),
    enabled: !!effectiveOrderId,
    staleTime: 30000,
  })

  const jobStatusQuery = useQuery({
    queryKey: ['route', 'job', pollingJobId],
    queryFn: () => routesAPI.getJobStatus(pollingJobId!),
    enabled: !!pollingJobId,
    refetchInterval: (data) => {
      if (!data) return 1000
      return data.status === 'completed' || data.status === 'failed' ? false : 1000
    },
  })

  useEffect(() => {
    if (jobStatusQuery.data?.status === 'completed' || jobStatusQuery.data?.status === 'failed') {
      setPollingJobId(null)
      currentRouteQuery.refetch()
      historyQuery.refetch()
    }
  }, [jobStatusQuery.data?.status])

  const handleOptimize = useCallback(async () => {
    if (!effectiveOrderId) return
    try {
      const resp = await routesAPI.optimizeRoute(effectiveOrderId)
      setPollingJobId(resp.job_id)
    } catch (e) {
      console.error('Failed to submit optimization job:', e)
    }
  }, [effectiveOrderId])

  const handleViewOnMap = useCallback(() => {
    if (effectiveOrderId) {
      fleetStore.getState().setSelectedOrder(effectiveOrderId)
    }
  }, [effectiveOrderId])

  const currentRoute = currentRouteQuery.data
  const history = historyQuery.data ?? []
  const previousRoute = history.length > 1 ? history[1] : null
  const isOptimizing = !!pollingJobId

  const displayRoute = showBefore && previousRoute ? previousRoute : currentRoute

  const savings = useMemo(() => {
    if (!currentRoute || !previousRoute) return null
    const distSaved = previousRoute.total_distance_km - currentRoute.total_distance_km
    const timeSaved = previousRoute.total_duration_minutes - currentRoute.total_duration_minutes
    const fuelSaved = distSaved * FUEL_PER_KM
    return { distance: distSaved, time: timeSaved, fuel: fuelSaved }
  }, [currentRoute, previousRoute])

  const solverConfidence = displayRoute
    ? SOLVER_CONFIDENCE[displayRoute.solver_status] ?? SOLVER_CONFIDENCE.unknown
    : null

  const currentSeq = useMemo(
    () => currentRoute?.waypoints?.map((w) => w.sequence) ?? [],
    [currentRoute]
  )
  const optimizedSeq = useMemo(
    () => currentRoute?.waypoints?.slice().sort((a, b) => a.sequence - b.sequence).map((w) => w.sequence) ?? null,
    [currentRoute]
  )

  return (
    <div className="bg-abyss border border-steel-grey/30 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-steel-grey/30 bg-obsidian/50">
        <div className="flex items-center gap-2">
          <Route className="w-5 h-5 text-accent" />
          <h3 className="text-base font-bold text-pearl">Route Optimization</h3>
        </div>
        <select
          value={effectiveOrderId ?? ''}
          onChange={(e) => setTargetOrderId(e.target.value || null)}
          className="bg-navy border border-steel-grey/30 rounded text-xs text-pearl px-3 py-1.5 max-w-[180px] focus:border-accent/50 focus:outline-none"
        >
          <option value="">Select order...</option>
          {activeOrders.map((o) => (
            <option key={o.id} value={o.id}>
              {formatOrderId(o.id)}
            </option>
          ))}
        </select>
      </div>

      {!effectiveOrderId ? (
        <div className="flex flex-col items-center justify-center py-14 text-center px-6">
          <Route className="w-10 h-10 text-mist/30 mb-3" />
          <p className="text-mist font-medium">Select an order to view route optimization</p>
          <p className="text-xs text-mist/60 mt-1">Choose from active orders or click a marker on the map</p>
        </div>
      ) : currentRouteQuery.isLoading ? (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
          </div>
          <div className="skeleton h-40 rounded-lg" />
        </div>
      ) : currentRouteQuery.isError ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-6">
          <AlertTriangle className="w-8 h-8 text-warning mb-2" />
          <p className="text-sm text-mist font-medium">Failed to load route data</p>
          <button
            onClick={() => currentRouteQuery.refetch()}
            className="btn btn--secondary btn--sm mt-3"
          >
            Retry
          </button>
        </div>
      ) : !currentRoute ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-6">
          <MapPin className="w-8 h-8 text-mist/30 mb-2" />
          <p className="text-sm text-mist font-medium">No route plan found</p>
          <p className="text-xs text-mist/60 mt-1">Submit an optimization job to generate the first route</p>
          <button
            onClick={handleOptimize}
            disabled={isOptimizing}
            className="btn btn--primary btn--sm mt-4"
          >
            {isOptimizing ? 'Optimizing...' : 'Optimize Route'}
          </button>
        </div>
      ) : (
        <>
          {previousRoute && (
            <div className="flex items-center gap-2 px-5 py-2 border-b border-steel-grey/20 bg-navy/30">
              <button
                onClick={() => setShowBefore(false)}
                className={clsx(
                  'text-[11px] font-medium px-3 py-1 rounded transition-colors',
                  !showBefore ? 'bg-accent/15 text-accent border border-accent/20' : 'text-mist hover:text-cloud border border-transparent'
                )}
              >
                Optimized
              </button>
              <button
                onClick={() => setShowBefore(true)}
                className={clsx(
                  'text-[11px] font-medium px-3 py-1 rounded transition-colors',
                  showBefore ? 'bg-navy text-cloud border border-steel-grey/30' : 'text-mist hover:text-cloud border border-transparent'
                )}
              >
                Original
              </button>
              {savings && !showBefore && (
                <span className="text-[10px] text-success ml-auto">
                  -{savings.distance.toFixed(1)} km &middot; -{savings.time.toFixed(0)} min
                </span>
              )}
            </div>
          )}

          {previousRoute && savings && (
            <div className="grid grid-cols-3 gap-3 px-5 pt-4">
              <MetricCard
                label="Distance Saved"
                value={`-${savings.distance.toFixed(1)} km`}
                sub={`${((savings.distance / previousRoute.total_distance_km) * 100).toFixed(0)}% reduction`}
                icon={<Route className="w-4 h-4" />}
                highlight="positive"
              />
              <MetricCard
                label="Time Saved"
                value={`-${savings.time.toFixed(0)} min`}
                sub={`${((savings.time / previousRoute.total_duration_minutes) * 100).toFixed(0)}% faster`}
                icon={<Clock className="w-4 h-4" />}
                highlight="positive"
              />
              <MetricCard
                label="Fuel Saved"
                value={`${savings.fuel.toFixed(2)} L`}
                sub={`~${(savings.fuel * 1.5).toFixed(2)} kg CO₂`}
                icon={<Fuel className="w-4 h-4" />}
                highlight="positive"
              />
            </div>
          )}

          <div className="p-5">
            <div className="grid grid-cols-4 gap-3 mb-4">
              {displayRoute && (
                <MetricCard
                  label="Distance"
                  value={`${displayRoute.total_distance_km.toFixed(1)} km`}
                  icon={<Route className="w-4 h-4" />}
                />
              )}
              {displayRoute && (
                <MetricCard
                  label="Duration"
                  value={`${Math.round(displayRoute.total_duration_minutes)} min`}
                  icon={<Clock className="w-4 h-4" />}
                />
              )}
              {displayRoute && (
                <MetricCard
                  label="Stops"
                  value={`${displayRoute.waypoints.length}`}
                  icon={<MapPin className="w-4 h-4" />}
                />
              )}
              <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-mist uppercase tracking-wider">Confidence</span>
                  <Gauge className="w-4 h-4 text-mist" />
                </div>
                {solverConfidence ? (
                  <div className="space-y-1">
                    <span className={clsx('text-xs font-semibold px-1.5 py-0.5 rounded inline-block', solverConfidence.color)}>
                      {solverConfidence.label}
                    </span>
                    <div className="h-1 bg-navy rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full rounded-full bg-accent/60"
                        style={{ width: `${solverConfidence.pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-mist/60">—</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-3.5 h-3.5 text-mist" />
                  <h4 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Stop Sequence</h4>
                </div>
                <StopSequence current={currentSeq} optimized={!showBefore ? optimizedSeq : null} />
              </div>

              <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-3.5 h-3.5 text-mist" />
                  <h4 className="text-[10px] font-semibold text-mist uppercase tracking-wider">
                    Optimization History ({history.length})
                  </h4>
                </div>
                {history.length === 0 ? (
                  <p className="text-xs text-mist/60">No optimization history</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-hide">
                    {history.map((entry, idx) => {
                      const conf = SOLVER_CONFIDENCE[entry.solver_status] ?? SOLVER_CONFIDENCE.unknown
                      return (
                        <div
                          key={entry.route_plan_id || idx}
                          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-navy/60 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {idx === 0 ? (
                              <CheckCircle className="w-3 h-3 text-success flex-shrink-0" />
                            ) : (
                              <History className="w-3 h-3 text-mist/40 flex-shrink-0" />
                            )}
                            <span className="text-[10px] font-mono text-mist/70">
                              {format(new Date(entry.created_at), 'HH:mm MMM dd')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 text-[10px] font-mono">
                            <span className="text-cloud">{entry.total_distance_km.toFixed(1)}km</span>
                            <span className="text-mist/40">|</span>
                            <span className="text-cloud">{Math.round(entry.total_duration_minutes)}m</span>
                            <span className={clsx('text-[9px] font-semibold px-1 py-0.5 rounded', conf.color)}>
                              {entry.solver_status}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-steel-grey/20 bg-obsidian/30">
            <button
              onClick={handleViewOnMap}
              className="btn btn--ghost btn--sm"
            >
              <MapPin className="w-3 h-3" />
              View on Map
            </button>
            <div className="flex items-center gap-2">
              {isOptimizing && (
                <span className="text-[10px] text-accent flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Running...
                </span>
              )}
              <button
                onClick={handleOptimize}
                disabled={isOptimizing}
                className="btn btn--primary btn--sm"
              >
                <RefreshCw className={clsx('w-3 h-3', isOptimizing && 'animate-spin')} />
                {isOptimizing ? 'Optimizing' : 'Optimize Route'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

import React, { useMemo } from 'react'
import { fleetStore, useOrdersArray } from '@/store/fleetStore'
import { useQuery } from '@tanstack/react-query'
import { predictionsAPI } from '@/api/predictions'
import { Warning, Circle, Crosshair, ChartLineUp } from '@phosphor-icons/react'
import clsx from 'clsx'

const BAND_LABELS = ['Low (<30%)', 'Medium (30-70%)', 'High (>70%)'] as const
const BAND_COLORS = ['bg-success/60', 'bg-warning/60', 'bg-critical/60'] as const
const BAND_TEXT = ['text-success', 'text-warning', 'text-critical'] as const

export const FleetIntelligence: React.FC = () => {
  const orders = useOrdersArray()
  const connectionStatus = fleetStore((s) => s.connectionStatus)

  const highRiskIds = useMemo(() => orders.filter((o) => o.is_high_risk).map((o) => o.id), [orders])

  const batchQuery = useQuery({
    queryKey: ['predictions', 'batch', highRiskIds],
    queryFn: () => predictionsAPI.getBatchPredictions(highRiskIds),
    enabled: highRiskIds.length > 0,
    staleTime: 15000,
  })

  const riskDistribution = useMemo(() => {
    const low = orders.filter((o) => o.risk_score < 0.3).length
    const med = orders.filter((o) => o.risk_score >= 0.3 && o.risk_score <= 0.7).length
    const high = orders.filter((o) => o.risk_score > 0.7).length
    const total = orders.length || 1
    return [
      { label: BAND_LABELS[0], count: low, pct: (low / total) * 100, color: BAND_COLORS[0], textColor: BAND_TEXT[0] },
      { label: BAND_LABELS[1], count: med, pct: (med / total) * 100, color: BAND_COLORS[1], textColor: BAND_TEXT[1] },
      { label: BAND_LABELS[2], count: high, pct: (high / total) * 100, color: BAND_COLORS[2], textColor: BAND_TEXT[2] },
    ]
  }, [orders])

  const delayMetrics = useMemo(() => {
    const delayed = orders.filter((o) => (o.delay_minutes ?? 0) > 0)
    const avgDelay = delayed.length > 0
      ? delayed.reduce((s, o) => s + (o.delay_minutes ?? 0), 0) / delayed.length
      : 0
    const maxDelay = delayed.reduce((s, o) => Math.max(s, o.delay_minutes ?? 0), 0)
    return { delayedCount: delayed.length, avgDelay, maxDelay }
  }, [orders])

  const confidenceDistribution = useMemo(() => {
    const preds = batchQuery.data
    if (!preds) return null
    const entries = Object.values(preds)
    if (entries.length === 0) return null
    const high = entries.filter((p) => p.confidence > 0.8).length
    const med = entries.filter((p) => p.confidence >= 0.5 && p.confidence <= 0.8).length
    const low = entries.filter((p) => p.confidence < 0.5).length
    const total = entries.length || 1
    return [
      { label: 'High (>80%)', count: high, pct: (high / total) * 100, color: 'bg-success/60' },
      { label: 'Medium (50-80%)', count: med, pct: (med / total) * 100, color: 'bg-warning/60' },
      { label: 'Low (<50%)', count: low, pct: (low / total) * 100, color: 'bg-critical/60' },
    ]
  }, [batchQuery.data])

  const connected = connectionStatus === 'connected'

  return (
    <div className="space-y-5">
      <div className="bg-abyss border border-steel-grey/30 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-pearl mb-4 flex items-center gap-2">
          <Warning size={14} className="text-accent" />
          Risk Distribution
        </h3>
        {orders.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-center">
            <Circle size={20} className="text-mist/30 mb-1" />
            <p className="text-xs text-mist/60">No order data available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {riskDistribution.map((band) => (
              <div key={band.label}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className={clsx('text-xs font-medium', band.textColor)}>{band.label}</span>
                  <span className="text-xs font-mono text-mist">{band.count} orders ({band.pct.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-navy rounded-full h-2 overflow-hidden">
                  <div className={`h-full ${band.color} rounded-full transition-all`} style={{ width: `${band.pct}%` }} />
                </div>
              </div>
            ))}
            {connected && (
              <p className="text-[10px] text-mist/60 mt-2">{orders.length} total orders · live via WebSocket</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Crosshair size={12} className="text-critical" />
            <h3 className="text-[11px] font-semibold text-mist uppercase tracking-wider">High-Risk Orders</h3>
          </div>
          <p className={clsx(
            'text-2xl font-bold font-mono',
            riskDistribution[2].count > 3 ? 'text-critical' : riskDistribution[2].count > 0 ? 'text-warning' : 'text-success'
          )}>
            {riskDistribution[2].count}
          </p>
          <p className="text-xs text-mist/60 mt-1">
            {orders.length > 0 ? `${(riskDistribution[2].count / orders.length * 100).toFixed(0)}% of active` : '—'}
          </p>
        </div>

        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <ChartLineUp size={12} className="text-warning" />
            <h3 className="text-[11px] font-semibold text-mist uppercase tracking-wider">Delay Risk</h3>
          </div>
          <p className="text-2xl font-bold font-mono text-pearl">
            {delayMetrics.delayedCount}
          </p>
          <p className="text-xs text-mist/60 mt-1">
            {delayMetrics.avgDelay > 0 ? `avg ${delayMetrics.avgDelay.toFixed(0)}m delay` : 'No delays detected'}
          </p>
        </div>
      </div>

      {confidenceDistribution && (
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-pearl mb-4 flex items-center gap-2">
            <ChartLineUp size={14} className="text-accent" />
            Prediction Confidence Distribution
          </h3>
          <div className="space-y-3">
            {confidenceDistribution.map((band) => (
              <div key={band.label}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-mist">{band.label}</span>
                  <span className="text-xs font-mono text-cloud">{band.count} preds ({band.pct.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-navy rounded-full h-2 overflow-hidden">
                  <div className={`h-full ${band.color} rounded-full transition-all`} style={{ width: `${band.pct}%` }} />
                </div>
              </div>
            ))}
            {batchQuery.isFetching && <p className="text-[10px] text-accent/60">updating...</p>}
          </div>
        </div>
      )}

      {highRiskIds.length > 0 && !batchQuery.data && !batchQuery.isLoading && !batchQuery.isError && (
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4 text-center">
          <p className="text-xs text-mist/60">Fetching prediction confidence for {highRiskIds.length} high-risk orders...</p>
        </div>
      )}
    </div>
  )
}

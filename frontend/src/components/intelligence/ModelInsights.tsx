import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { predictionsAPI } from '@/api/predictions'
import { useOrdersArray } from '@/store/fleetStore'
import { RiskFactor } from '@/types/api'
import { Cpu, BarChart3, Activity, Sigma, AlertTriangle, Gauge } from 'lucide-react'
import clsx from 'clsx'

const FEATURE_LABELS: Record<string, string> = {
  hour_of_day: 'Time of Day',
  day_of_week: 'Day of Week',
  speed: 'Speed',
  stops_remaining: 'Stops Remaining',
  driver_on_time_rate: 'Driver History',
  deviation_meters: 'Route Deviation',
  eta_minutes_remaining: 'Delivery Window',
  traffic_density: 'Traffic Density',
  weather: 'Weather',
  distance_remaining: 'Distance Remaining',
}

const featureLabel = (name: string): string => FEATURE_LABELS[name] || name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const BINS = [
  { label: '0-20%', min: 0, max: 0.2 },
  { label: '20-40%', min: 0.2, max: 0.4 },
  { label: '40-60%', min: 0.4, max: 0.6 },
  { label: '60-80%', min: 0.6, max: 0.8 },
  { label: '80-100%', min: 0.8, max: 1.01 },
]

interface AggregatedFeature {
  feature: string
  label: string
  totalContribution: number
  avgContribution: number
  direction: 'increases' | 'decreases'
  frequency: number
}

function aggregateShapFactors(factors: RiskFactor[][]): AggregatedFeature[] {
  const acc = new Map<string, { total: number; count: number; increasesCount: number; decreasesCount: number }>()

  for (const orderFactors of factors) {
    for (const f of orderFactors) {
      const existing = acc.get(f.feature)
      if (existing) {
        existing.total += f.contribution
        existing.count++
        if (f.direction === 'increases') existing.increasesCount++
        else existing.decreasesCount++
      } else {
        acc.set(f.feature, {
          total: f.contribution,
          count: 1,
          increasesCount: f.direction === 'increases' ? 1 : 0,
          decreasesCount: f.direction === 'decreases' ? 1 : 0,
        })
      }
    }
  }

  return Array.from(acc.entries())
    .map(([feature, stats]) => ({
      feature,
      label: featureLabel(feature),
      totalContribution: stats.total,
      avgContribution: stats.total / stats.count,
      direction: stats.increasesCount > stats.decreasesCount ? 'increases' as const : 'decreases' as const,
      frequency: stats.count,
    }))
    .sort((a, b) => b.avgContribution - a.avgContribution)
}

function buildHistogram(values: number[], bins: typeof BINS) {
  const total = values.length
  return bins.map((bin) => {
    const count = values.filter((v) => v >= bin.min && v < bin.max).length
    return { ...bin, count, pct: total > 0 ? count / total : 0 }
  })
}

interface FeatureBarProps {
  label: string
  pct: number
  value: string
  color: string
}

const FeatureBar: React.FC<FeatureBarProps> = ({ label, pct, value, color }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-xs text-cloud truncate mr-2">{label}</span>
      <span className="text-xs font-mono font-medium text-pearl flex-shrink-0">{value}</span>
    </div>
    <div className="h-2 bg-navy rounded-full overflow-hidden">
      <div
        className={clsx('h-full rounded-full transition-all duration-700', color)}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  </div>
)

export const ModelInsights: React.FC = () => {
  const orders = useOrdersArray()
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled'), [orders])
  const activeIds = useMemo(() => activeOrders.map((o) => o.id), [activeOrders])

  const modelInfoQuery = useQuery({
    queryKey: ['model-info'],
    queryFn: () => predictionsAPI.getModelInfo(),
    staleTime: Infinity,
  })

  const batchQuery = useQuery({
    queryKey: ['predictions', 'batch', activeIds],
    queryFn: () => predictionsAPI.getBatchPredictions(activeIds),
    enabled: activeIds.length > 0,
    staleTime: 15000,
  })

  const shapTargetIds = useMemo(() => activeIds.slice(0, 10), [activeIds])

  const shapQueries = useQuery({
    queryKey: ['predictions', 'shap', shapTargetIds],
    queryFn: async () => {
      const results = await Promise.allSettled(
        shapTargetIds.map((id) => predictionsAPI.getPrediction(id))
      )
      return results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<any>).value)
    },
    enabled: shapTargetIds.length > 0,
    staleTime: 30000,
  })

  const aggregatedFeatures = useMemo(() => {
    if (!shapQueries.data || shapQueries.data.length === 0) return []
    const allFactors = shapQueries.data
      .filter((p: any) => p?.top_risk_factors || p?.topRiskFactors)
      .map((p: any) => (p.top_risk_factors || p.topRiskFactors || []) as RiskFactor[])
    return aggregateShapFactors(allFactors)
  }, [shapQueries.data])

  const batchResults = useMemo(() => {
    if (!batchQuery.data) return []
    return Object.values(batchQuery.data)
  }, [batchQuery.data])

  const riskScores = useMemo(() => batchResults.map((r: any) => r.risk_score as number), [batchResults])
  const riskHistogram = useMemo(() => buildHistogram(riskScores, BINS), [riskScores])

  const confidenceValues = useMemo(() => {
    if (!shapQueries.data || shapQueries.data.length === 0) return []
    return shapQueries.data
      .filter((p: any) => p?.confidence != null)
      .map((p: any) => p.confidence as number)
  }, [shapQueries.data])

  const confidenceHistogram = useMemo(() => buildHistogram(confidenceValues, BINS), [confidenceValues])

  const modelInfo = modelInfoQuery.data

  const isLoading = modelInfoQuery.isLoading || batchQuery.isLoading
  const shapLoading = shapQueries.isLoading
  const hasError = modelInfoQuery.isError
  const hasShap = aggregatedFeatures.length > 0
  const hasRiskData = riskScores.length > 0

  if (isLoading && !modelInfo && riskScores.length === 0) {
    return (
      <div className="bg-abyss border border-steel-grey/30 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-bold text-pearl">Model Intelligence</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
        </div>
        <div className="skeleton h-48 rounded-lg" />
        <div className="skeleton h-36 rounded-lg" />
      </div>
    )
  }

  if (hasError) {
    return (
      <div className="bg-abyss border border-steel-grey/30 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Cpu className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-bold text-pearl">Model Intelligence</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <AlertTriangle className="w-10 h-10 text-critical mb-3" />
          <p className="text-critical font-medium">Failed to load model data</p>
          <p className="text-sm text-mist/60 mt-1">Check backend connection and try again</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-abyss border border-steel-grey/30 rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-accent" />
          <div>
            <h2 className="text-lg font-bold text-pearl">Model Intelligence</h2>
            {modelInfo && (
              <p className="text-xs text-mist">
                {modelInfo.name} v{modelInfo.version} &middot; {modelInfo.features.length} features &middot;{' '}
                <span className={clsx(
                  modelInfo.status === 'active' ? 'text-success' : 'text-warning'
                )}>{modelInfo.status}</span>
              </p>
            )}
          </div>
        </div>
        {modelInfo?.confidence_thresholds && (
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-mist font-mono">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success" /> High &ge;{(modelInfo.confidence_thresholds.high * 100).toFixed(0)}%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-warning" /> Med &ge;{(modelInfo.confidence_thresholds.medium * 100).toFixed(0)}%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-mist" /> Low &lt;{(modelInfo.confidence_thresholds.medium * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-4">
          <p className="kpi-label mb-1">Model Version</p>
          <p className="kpi-value">{modelInfo?.version ?? '—'}</p>
        </div>
        <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-4">
          <p className="kpi-label mb-1">Active Features</p>
          <p className="kpi-value">{modelInfo?.features.length ?? '—'}</p>
        </div>
        <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-4">
          <p className="kpi-label mb-1">Predictions</p>
          <p className="kpi-value">{riskScores.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-accent" />
            <h3 className="text-xs font-semibold text-mist uppercase tracking-wider">Global Feature Importance</h3>
            {shapLoading && <span className="text-[10px] text-mist/60 ml-auto animate-pulse">Loading SHAP...</span>}
          </div>

          {!hasShap ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Sigma className="w-8 h-8 text-mist/30 mb-2" />
              <p className="text-xs text-mist/60">No SHAP data available{activeIds.length > 0 ? ' — fetching predictions' : ' — no active orders'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {aggregatedFeatures.slice(0, 7).map((feat) => {
                const pct = Math.min(feat.avgContribution * 100, 100)
                const color = feat.direction === 'increases' ? 'bg-critical/60' : 'bg-success/60'
                return (
                  <FeatureBar
                    key={feat.feature}
                    label={feat.label}
                    pct={pct}
                    value={`${feat.direction === 'increases' ? '+' : '-'}${pct.toFixed(0)}%`}
                    color={color}
                  />
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-warning" />
            <h3 className="text-xs font-semibold text-mist uppercase tracking-wider">Risk Distribution</h3>
            {riskScores.length > 0 && (
              <span className="text-[10px] text-mist/60 ml-auto">{riskScores.length} orders</span>
            )}
          </div>

          {!hasRiskData ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Gauge className="w-8 h-8 text-mist/30 mb-2" />
              <p className="text-xs text-mist/60">No active orders with risk data</p>
            </div>
          ) : (
            <div className="space-y-3">
              {riskHistogram.map((bin) => {
                const maxCount = Math.max(...riskHistogram.map((b) => b.count), 1)
                const barPct = (bin.count / maxCount) * 100
                const isHigh = bin.label === '80-100%' || bin.label === '60-80%'
                return (
                  <div key={bin.label} className="flex items-center gap-3">
                    <span className="text-[10px] text-mist font-mono w-14 flex-shrink-0">{bin.label}</span>
                    <div className="flex-1 h-5 bg-navy rounded-sm overflow-hidden relative">
                      <div
                        className={clsx(
                          'h-full rounded-sm transition-all duration-500',
                          isHigh ? 'bg-critical/50' : 'bg-accent/40'
                        )}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-mist font-mono w-6 text-right flex-shrink-0">{bin.count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="w-4 h-4 text-teal" />
            <h3 className="text-xs font-semibold text-mist uppercase tracking-wider">Prediction Confidence</h3>
            {confidenceValues.length > 0 && (
              <span className="text-[10px] text-mist/60 ml-auto">{confidenceValues.length} predictions</span>
            )}
          </div>

          {confidenceValues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="w-8 h-8 text-mist/30 mb-2" />
              <p className="text-xs text-mist/60">Confidence data available per-order only</p>
            </div>
          ) : (
            <div className="space-y-3">
              {confidenceHistogram.map((bin) => {
                const maxCount = Math.max(...confidenceHistogram.map((b) => b.count), 1)
                const barPct = (bin.count / maxCount) * 100
                const isHigh = bin.label === '80-100%'
                return (
                  <div key={bin.label} className="flex items-center gap-3">
                    <span className="text-[10px] text-mist font-mono w-14 flex-shrink-0">{bin.label}</span>
                    <div className="flex-1 h-5 bg-navy rounded-sm overflow-hidden relative">
                      <div
                        className={clsx(
                          'h-full rounded-sm transition-all duration-500',
                          isHigh ? 'bg-success/50' : 'bg-accent/40'
                        )}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-mist font-mono w-6 text-right flex-shrink-0">{bin.count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Sigma className="w-4 h-4 text-info" />
            <h3 className="text-xs font-semibold text-mist uppercase tracking-wider">Top Contributing Features</h3>
          </div>

          {hasShap ? (
            <div className="space-y-2">
              {aggregatedFeatures.slice(0, 6).map((feat, idx) => (
                <div
                  key={feat.feature}
                  className="flex items-center justify-between py-1.5 border-b border-steel-grey/10 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-mist/50 w-4">{idx + 1}</span>
                    <span className="text-xs text-cloud">{feat.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-mist">{(feat.frequency / Math.max(...aggregatedFeatures.map((f) => f.frequency)) * 100).toFixed(0)}% freq</span>
                    <span className={clsx(
                      'text-xs font-mono font-semibold',
                      feat.direction === 'increases' ? 'text-critical' : 'text-success'
                    )}>
                      {feat.direction === 'increases' ? '+' : '-'}{(feat.avgContribution * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Cpu className="w-8 h-8 text-mist/30 mb-2" />
              <p className="text-xs text-mist/60">Aggregate SHAP data from predictions to populate</p>
            </div>
          )}
        </div>
      </div>

      {modelInfo && (
        <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-mist" />
            <h3 className="text-xs font-semibold text-mist uppercase tracking-wider">Model Features</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {modelInfo.features.map((feat) => (
              <span
                key={feat}
                className="text-[11px] font-mono text-cloud bg-navy border border-steel-grey/30 px-2.5 py-1 rounded"
              >
                {featureLabel(feat)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

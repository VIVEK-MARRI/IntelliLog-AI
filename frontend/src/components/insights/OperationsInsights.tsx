import React, { useMemo } from 'react'
import { useOrdersArray } from '@/store/fleetStore'
import { OperationalMetrics, Recommendation } from '@/types/api'
import { MetricCard } from '../shared/MetricCard'
import clsx from 'clsx'

interface OperationsInsightsProps {
  metrics: OperationalMetrics | null
  recommendations: Recommendation[]
  delayCauses?: Array<{
    cause: string
    percentage: number
    affected_orders: number
    trend: 'up' | 'down' | 'stable'
  }>
}

export const OperationsInsights: React.FC<OperationsInsightsProps> = ({
  metrics,
  recommendations,
  delayCauses = [],
}) => {
  const orders = useOrdersArray()

  const insights = useMemo(() => {
    return {
      activeHighRisk: orders.filter((o) => o.is_high_risk).length,
      onTimePercentage: metrics?.on_time_percentage ?? 0,
      criticalRecommendations: recommendations.filter((r) => r.priority === 'critical'),
    }
  }, [orders, metrics, recommendations])

  if (!metrics) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Active Deliveries" value="—" status="ok" />
          <MetricCard label="High-Risk Orders" value="—" status="ok" />
          <MetricCard label="Avg Delay" value="—" unit="min" status="ok" />
          <MetricCard label="On-Time Rate" value="—" unit="%" status="ok" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label="Active Deliveries"
          value={metrics.active_deliveries}
          status="ok"
        />
        <MetricCard
          label="High-Risk Orders"
          value={metrics.high_risk_deliveries}
          status={metrics.high_risk_deliveries > 5 ? 'warning' : 'ok'}
        />
        <MetricCard
          label="Avg Delay"
          value={metrics.average_delay_minutes.toFixed(1)}
          unit="min"
          status={metrics.average_delay_minutes > 10 ? 'warning' : 'ok'}
        />
        <MetricCard
          label="On-Time Rate"
          value={metrics.on_time_percentage.toFixed(0)}
          unit="%"
          status={metrics.on_time_percentage < 70 ? 'warning' : 'ok'}
        />
      </div>

      {delayCauses.length > 0 && (
        <div className="bg-abyss rounded border border-steel-grey/30 p-4">
          <h4 className="text-sm font-semibold text-cloud uppercase tracking-wider mb-3">
            Top Delay Causes Today
          </h4>

          <div className="space-y-3">
            {delayCauses.slice(0, 3).map((cause, idx) => (
              <DelayCauseBar key={`${cause.cause}-${idx}`} cause={cause} />
            ))}
          </div>
        </div>
      )}

      {insights.criticalRecommendations.length > 0 && (
        <div className="bg-critical-DEFAULT/5 border border-critical-DEFAULT/30 rounded p-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <div className="w-2 h-2 bg-critical-DEFAULT rounded-full animate-status-pulse" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-critical-DEFAULT mb-2">
                Critical Recommendations
              </h4>
              <ul className="space-y-1">
                {insights.criticalRecommendations.slice(0, 2).map((rec) => (
                  <li key={rec.id} className="text-xs text-cloud">
                    <span className="font-semibold">{rec.title}:</span> {rec.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="bg-abyss rounded border border-steel-grey/30 p-4">
        <h4 className="text-sm font-semibold text-cloud uppercase tracking-wider mb-3">
          AI Recommendations
        </h4>

        {recommendations.length === 0 ? (
          <p className="text-xs text-mist/60">No recommendations at this time</p>
        ) : (
          <div className="space-y-2">
            {recommendations.slice(0, 3).map((rec) => (
              <div key={rec.id} className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-cloud">{rec.title}</span>
                  <span className={clsx(
                    'px-1.5 py-0.5 rounded text-xs font-semibold',
                    rec.priority === 'critical' && 'bg-critical-DEFAULT/20 text-critical-DEFAULT',
                    rec.priority === 'high' && 'bg-warning-DEFAULT/20 text-warning-DEFAULT',
                    rec.priority === 'medium' && 'bg-steel-grey text-cloud',
                    rec.priority === 'low' && 'bg-navy text-mist'
                  )}>
                    {rec.priority.toUpperCase()}
                  </span>
                </div>
                <p className="text-mist/70 line-clamp-2">{rec.description}</p>
                <div className="flex items-center gap-2 mt-1 text-mist/60">
                  <span>Impact: +{rec.estimated_impact_percentage}%</span>
                  <span>&bull;</span>
                  <span>Confidence: {(rec.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface DelayCauseBarProps {
  cause: {
    cause: string
    percentage: number
    affected_orders: number
    trend: 'up' | 'down' | 'stable'
  }
}

const DelayCauseBar: React.FC<DelayCauseBarProps> = ({ cause }) => {
  const trendIcon = {
    up: '\u2191',
    down: '\u2193',
    stable: '\u2192',
  }

  const trendColor = {
    up: 'text-critical-DEFAULT',
    down: 'text-success-DEFAULT',
    stable: 'text-mist/60',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-cloud">{cause.cause}</span>
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-cloud">
            {cause.percentage.toFixed(0)}%
          </span>
          <span className={clsx('text-xs', trendColor[cause.trend])}>
            {trendIcon[cause.trend]}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex-1 bg-navy rounded-full h-2 overflow-hidden mr-2">
          <div
            className="h-full bg-warning-DEFAULT transition-all"
            style={{ width: `${cause.percentage}%` }}
          />
        </div>
        <span className="text-xs text-mist/60">
          {cause.affected_orders} order{cause.affected_orders !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

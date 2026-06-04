import React from 'react'
import { FleetHealth } from '@/types/api'
import clsx from 'clsx'

interface FleetHealthCardProps {
  health: FleetHealth
}

export const FleetHealthCard: React.FC<FleetHealthCardProps> = React.memo(({ health }) => {
  const statusConfig = {
    excellent: {
      color: 'text-success-DEFAULT',
      bg: 'bg-success-DEFAULT',
      border: 'border-success-DEFAULT',
      label: 'Excellent',
    },
    healthy: {
      color: 'text-success-DEFAULT',
      bg: 'bg-success-DEFAULT',
      border: 'border-success-DEFAULT',
      label: 'Healthy',
    },
    warning: {
      color: 'text-warning-DEFAULT',
      bg: 'bg-warning-DEFAULT',
      border: 'border-warning-DEFAULT',
      label: 'Warning',
    },
    critical: {
      color: 'text-critical-DEFAULT',
      bg: 'bg-critical-DEFAULT',
      border: 'border-critical-DEFAULT',
      label: 'Critical',
    },
  }

  const config = statusConfig[health.status]
  const trendIcon = health.trend >= 0 ? '↑' : '↓'
  const trendColor = health.trend >= 0 ? 'text-success-DEFAULT' : 'text-critical-DEFAULT'

  return (
    <div className={clsx(
      'bg-abyss rounded border p-6 space-y-4',
      config.border
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-mist uppercase tracking-wider">
            Fleet Health
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className={clsx('text-4xl font-bold', config.color)}>
              {health.score}
            </p>
            <span className="text-mist/60">/100</span>
          </div>
        </div>

        <div className="text-right">
          <div className={clsx(
            'px-3 py-1 rounded-full text-xs font-semibold',
            `${config.bg}/10 ${config.color}`
          )}>
            {config.label}
          </div>
          <p className={clsx('text-xs mt-2 font-semibold', trendColor)}>
            {trendIcon} {Math.abs(health.trend)}% vs yesterday
          </p>
        </div>
      </div>

      <div className="border-t border-steel-grey/30 pt-4 space-y-3">
        <HealthMetric
          label="On-Time Rate"
          value={health.on_time_rate}
          target={85}
        />
        <HealthMetric
          label="Route Efficiency"
          value={health.route_efficiency}
          target={80}
        />
        <HealthMetric
          label="Low Delay Frequency"
          value={100 - health.delay_frequency}
          target={90}
        />
        <HealthMetric
          label="Risk Control"
          value={100 - health.risk_distribution}
          target={85}
        />
      </div>

      <div className="bg-obsidian rounded border border-steel-grey/30 p-3">
        <p className="text-xs text-mist">
          <span className="font-semibold text-cloud">Agent Interventions:</span> {health.intervention_frequency}% of orders required intervention
        </p>
      </div>
    </div>
  )
})

interface HealthMetricProps {
  label: string
  value: number
  target: number
}

const HealthMetric: React.FC<HealthMetricProps> = ({ label, value, target }) => {
  const isAboveTarget = value >= target

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-mist">{label}</span>
        <span className={clsx(
          'text-xs font-semibold',
          isAboveTarget ? 'text-success-DEFAULT' : 'text-warning-DEFAULT'
        )}>
          {value.toFixed(0)}%
        </span>
      </div>
      <div className="w-full bg-navy rounded-full h-1.5 overflow-hidden">
        <div
          className={clsx(
            'h-full transition-all',
            isAboveTarget ? 'bg-success-DEFAULT' : 'bg-warning-DEFAULT'
          )}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}

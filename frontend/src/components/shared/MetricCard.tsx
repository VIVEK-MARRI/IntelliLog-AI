import React from 'react'
import clsx from 'clsx'

interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  trend?: {
    direction: 'up' | 'down' | 'stable'
    percentage: number
    period: string
  }
  status?: 'ok' | 'warning' | 'critical'
  onClick?: () => void
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  trend,
  status = 'ok',
  onClick,
}) => {
  const statusColor = {
    ok: 'border-steel-grey/30',
    warning: 'border-warning-DEFAULT',
    critical: 'border-critical-DEFAULT',
  }

  const trendIcon = {
    up: '\u2191',
    down: '\u2193',
    stable: '\u2192',
  }

  const trendColor = {
    up: 'text-critical-DEFAULT',
    down: 'text-warning-DEFAULT',
    stable: 'text-mist/60',
  }

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-abyss rounded border p-4 transition-colors',
        statusColor[status],
        onClick && 'cursor-pointer hover:bg-navy'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-mist uppercase tracking-wide">
            {label}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-pearl">
              {value}
            </p>
            {unit && (
              <span className="text-sm text-mist/60">{unit}</span>
            )}
          </div>
        </div>

        {trend && (
          <div className="text-right">
            <div className={clsx('text-lg font-semibold', trendColor[trend.direction])}>
              {trendIcon[trend.direction]}
              {trend.percentage}%
            </div>
            <p className="text-xs text-mist/60 mt-1">
              vs {trend.period}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

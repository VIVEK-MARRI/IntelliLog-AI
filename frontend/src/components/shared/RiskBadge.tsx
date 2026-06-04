import React from 'react'
import clsx from 'clsx'

interface RiskBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
  showLabel?: boolean
  className?: string
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  score,
  size = 'md',
  animated = true,
  showLabel = true,
  className,
}) => {
  const isLow = score < 0.3
  const isModerate = score >= 0.3 && score < 0.7
  const isHigh = score >= 0.7

  const getRiskLabel = () => {
    if (isLow) return 'Low'
    if (isModerate) return 'Moderate'
    return 'High'
  }

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-base',
  }

  const containerClasses = {
    sm: 'gap-1',
    md: 'gap-2',
    lg: 'gap-2',
  }

  const borderClass = isHigh && animated ? 'border-critical-DEFAULT animate-status-pulse' : 'border-steel-grey/40'

  return (
    <div className={clsx('flex flex-col items-center', containerClasses[size], className)}>
      <div
        className={clsx(
          'flex items-center justify-center rounded-full font-bold border transition-all',
          sizeClasses[size],
          borderClass,
          isLow && 'bg-success-DEFAULT/10 text-success-DEFAULT border-success-DEFAULT',
          isModerate && 'bg-warning-DEFAULT/10 text-warning-DEFAULT border-warning-DEFAULT',
          isHigh && 'bg-critical-DEFAULT/10 text-critical-DEFAULT'
        )}
      >
        {(score * 100).toFixed(0)}
      </div>
      {showLabel && (
        <span className={clsx('text-xs font-medium', 
          isLow && 'text-success-DEFAULT',
          isModerate && 'text-warning-DEFAULT',
          isHigh && 'text-critical-DEFAULT'
        )}>
          {getRiskLabel()}
        </span>
      )}
    </div>
  )
}

interface RiskBarProps {
  score: number
  label?: string
  animated?: boolean
  showValue?: boolean
}

export const RiskBar: React.FC<RiskBarProps> = ({
  score,
  label,
  animated: _animated = true,
  showValue = true,
}) => {
  const isLow = score < 0.3
  const isModerate = score >= 0.3 && score < 0.7
  const isHigh = score >= 0.7

  const bgColor = isLow
    ? 'bg-success-DEFAULT'
    : isModerate
    ? 'bg-warning-DEFAULT'
    : 'bg-critical-DEFAULT'

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-mist">{label}</span>
          {showValue && (
            <span className={clsx(
              'text-sm font-semibold',
              isLow && 'text-success-DEFAULT',
              isModerate && 'text-warning-DEFAULT',
              isHigh && 'text-critical-DEFAULT'
            )}>
              {(score * 100).toFixed(0)}%
            </span>
          )}
        </div>
      )}
      <div className="w-full bg-navy rounded-full h-2 overflow-hidden">
        <div
          className={clsx('h-full transition-all duration-300', bgColor)}
          style={{ width: `${Math.min(score * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}

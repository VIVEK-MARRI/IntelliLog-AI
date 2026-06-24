import clsx from 'clsx'
import { TrustBadge, TrustLevel } from './TrustBadge'

interface ConfidenceDisplayProps {
  value: number
  label?: string
  size?: 'sm' | 'md'
  showBar?: boolean
  showLabel?: boolean
  className?: string
}

function toTrustLevel(score: number): TrustLevel {
  if (score >= 0.8) return 'high'
  if (score >= 0.5) return 'medium'
  if (score > 0) return 'low'
  return 'unknown'
}

export const ConfidenceDisplay: React.FC<ConfidenceDisplayProps> = ({
  value, label, size = 'sm', showBar = true, showLabel = true, className,
}) => {
  const trust = toTrustLevel(value)
  const barColor = trust === 'high' ? 'bg-success'
    : trust === 'medium' ? 'bg-warning'
    : trust === 'low' ? 'bg-critical' : 'bg-mist/30'

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      {showLabel && label && (
        <span className="text-[10px] text-mist/70 uppercase tracking-wider font-medium">{label}</span>
      )}
      <TrustBadge level={trust} score={value * 100} size={size} />
      {showBar && (
        <div className="flex-1 h-1.5 bg-navy/50 rounded-full overflow-hidden max-w-[60px]">
          <div
            className={clsx('h-full rounded-full transition-all duration-500', barColor)}
            style={{ width: `${Math.min(value * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

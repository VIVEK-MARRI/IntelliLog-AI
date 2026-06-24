import clsx from 'clsx'
import { SealCheck, SealWarning, Question, EyeClosed } from '@phosphor-icons/react'

export type TrustLevel = 'high' | 'medium' | 'low' | 'unknown' | 'error'

interface TrustBadgeProps {
  level: TrustLevel
  score?: number
  label?: string
  size?: 'sm' | 'md'
  showIcon?: boolean
}

const config: Record<TrustLevel, { color: string; bg: string; icon: typeof SealCheck; defaultLabel: string }> = {
  high: { color: 'text-success', bg: 'bg-success-bg', icon: SealCheck, defaultLabel: 'Verified' },
  medium: { color: 'text-warning', bg: 'bg-warning-bg', icon: SealWarning, defaultLabel: 'Estimated' },
  low: { color: 'text-critical', bg: 'bg-critical-bg', icon: SealWarning, defaultLabel: 'Low Confidence' },
  unknown: { color: 'text-mist/60', bg: 'bg-navy/40', icon: Question, defaultLabel: 'Unknown' },
  error: { color: 'text-critical', bg: 'bg-critical-bg', icon: EyeClosed, defaultLabel: 'No Data' },
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({ level, score, label, size = 'sm', showIcon = true }) => {
  const cfg = config[level]
  const Icon = cfg.icon
  const displayLabel = label ?? cfg.defaultLabel

  return (
    <span className={clsx(
      'inline-flex items-center gap-1 rounded font-medium',
      size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
      cfg.bg,
      cfg.color,
    )}>
      {showIcon && <Icon size={size === 'sm' ? 10 : 12} weight="fill" />}
      <span>{displayLabel}</span>
      {score !== undefined && (
        <span className={clsx('font-mono', size === 'sm' ? 'text-[9px]' : 'text-[10px]')}>
          {score.toFixed(0)}%
        </span>
      )}
    </span>
  )
}

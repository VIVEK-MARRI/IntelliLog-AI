import { useMemo } from 'react'
import clsx from 'clsx'
import { Clock, ClockAfternoon, ClockCountdown } from '@phosphor-icons/react'

interface DataFreshnessProps {
  timestamp: string | null
  maxAgeMs?: number
  label?: string
  compact?: boolean
  className?: string
}

type FreshnessLevel = 'fresh' | 'recent' | 'stale' | 'unknown'

const levelConfig: Record<FreshnessLevel, { color: string; dot: string; icon: typeof Clock }> = {
  fresh: { color: 'text-success', dot: 'bg-success', icon: Clock },
  recent: { color: 'text-warning', dot: 'bg-warning', icon: ClockAfternoon },
  stale: { color: 'text-critical', dot: 'bg-critical', icon: ClockCountdown },
  unknown: { color: 'text-mist/50', dot: 'bg-mist/30', icon: Clock },
}

function getLevel(ts: string | null, maxAgeMs: number): FreshnessLevel {
  if (!ts) return 'unknown'
  const age = Date.now() - new Date(ts).getTime()
  if (age < 0) return 'unknown'
  if (age < maxAgeMs * 0.5) return 'fresh'
  if (age < maxAgeMs) return 'recent'
  return 'stale'
}

function formatAge(ts: string | null): string {
  if (!ts) return '--'
  const age = Date.now() - new Date(ts).getTime()
  if (age < 1000) return 'just now'
  if (age < 60000) return `${Math.floor(age / 1000)}s ago`
  if (age < 3600000) return `${Math.floor(age / 60000)}m ago`
  if (age < 86400000) return `${Math.floor(age / 3600000)}h ago`
  return `${Math.floor(age / 86400000)}d ago`
}

export const DataFreshness: React.FC<DataFreshnessProps> = ({
  timestamp, maxAgeMs = 30000, label, compact = false, className,
}) => {
  const level = useMemo(() => getLevel(timestamp, maxAgeMs), [timestamp, maxAgeMs])
  const cfg = levelConfig[level]
  const Icon = cfg.icon

  if (compact) {
    return (
      <span className={clsx('inline-flex items-center gap-1', className)} title={label}>
        <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
        <span className={clsx('text-[9px] font-mono', cfg.color)}>{formatAge(timestamp)}</span>
      </span>
    )
  }

  return (
    <div className={clsx('flex items-center gap-1.5', className)}>
      <Icon size={12} className={cfg.color} weight="fill" />
      <span className={clsx('text-[10px] font-mono', cfg.color)}>
        {formatAge(timestamp)}
      </span>
      {label && <span className="text-[9px] text-mist/50">{label}</span>}
    </div>
  )
}

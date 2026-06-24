import { useRealtimeStore, ConnectionQuality } from '@/store/realtimeStore'
import { PulseDot } from './PulseDot'
import { WifiHigh, WifiSlash, WifiX } from '@phosphor-icons/react'
import clsx from 'clsx'

const qualityConfig: Record<ConnectionQuality, { label: string; status: 'ok' | 'degraded' | 'down'; icon: typeof WifiHigh }> = {
  good: { label: 'Live', status: 'ok', icon: WifiHigh },
  degraded: { label: 'Degraded', status: 'degraded', icon: WifiSlash },
  poor: { label: 'Poor', status: 'down', icon: WifiX },
}

export const ConnectionQualityIndicator: React.FC<{ className?: string }> = ({ className }) => {
  const quality = useRealtimeStore((s) => s.connectionQuality)
  const rttMs = useRealtimeStore((s) => s.rttMs)
  const cfg = qualityConfig[quality]
  const Icon = cfg.icon

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <Icon className={clsx(
        'w-3.5 h-3.5',
        quality === 'good' ? 'text-success' : quality === 'degraded' ? 'text-warning' : 'text-critical',
      )} weight="fill" />
      <span className={clsx(
        'text-[10px] font-medium',
        quality === 'good' ? 'text-success' : quality === 'degraded' ? 'text-warning' : 'text-critical',
      )}>
        {cfg.label}
      </span>
      <PulseDot status={cfg.status} size="sm" />
      {rttMs > 0 && (
        <span className="text-[9px] text-mist/40 font-mono">{rttMs}ms</span>
      )}
    </div>
  )
}

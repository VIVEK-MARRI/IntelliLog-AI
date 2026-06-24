import { useEffect, useState } from 'react'
import { PulseDot } from './PulseDot'
import clsx from 'clsx'

interface FleetHeartbeatProps {
  healthScore: number | null
  status: string | null
}

export const FleetHeartbeat: React.FC<FleetHeartbeatProps> = ({ healthScore, status }) => {
  const [beat, setBeat] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setBeat((b) => !b)
    }, 1250)
    return () => clearInterval(interval)
  }, [])

  const dotStatus = status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'ok'
  const scoreColor = healthScore !== null
    ? healthScore >= 80 ? 'text-success'
      : healthScore >= 50 ? 'text-warning' : 'text-critical'
    : 'text-mist/50'

  return (
    <div className="flex items-center gap-2">
      <span className={clsx(
        'w-2 h-2 rounded-full transition-all duration-300',
        dotStatus === 'ok' ? 'bg-success shadow-[0_0_6px_rgba(14,165,233,0.5)]' :
        dotStatus === 'warning' ? 'bg-warning shadow-[0_0_6px_rgba(245,158,11,0.5)]' :
        'bg-critical shadow-[0_0_6px_rgba(239,68,68,0.5)]',
        beat ? 'scale-100' : 'scale-75',
      )} />
      <span className={clsx(
        'text-[10px] font-mono font-semibold transition-colors duration-500',
        scoreColor,
      )}>
        {healthScore !== null ? `${Math.round(healthScore)}%` : '--'}
      </span>
      <PulseDot status={dotStatus} size="sm" />
    </div>
  )
}

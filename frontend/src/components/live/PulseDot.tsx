import clsx from 'clsx'

interface PulseDotProps {
  status: 'ok' | 'degraded' | 'down' | 'active' | 'warning' | 'critical'
  size?: 'sm' | 'md' | 'lg'
  label?: string
  pulse?: boolean
}

const colorMap: Record<string, string> = {
  ok: 'bg-success',
  active: 'bg-accent',
  degraded: 'bg-warning',
  warning: 'bg-warning',
  down: 'bg-critical',
  critical: 'bg-critical',
}

const sizeMap = { sm: 'w-1.5 h-1.5', md: 'w-2 h-2', lg: 'w-2.5 h-2.5' }

export const PulseDot: React.FC<PulseDotProps> = ({ status, size = 'sm', label, pulse = true }) => (
  <span className="inline-flex items-center gap-1.5" title={label}>
    <span className={clsx(
      'rounded-full inline-block',
      sizeMap[size],
      colorMap[status] || 'bg-mist/50',
      pulse && 'animate-pulse',
    )} />
    {label && <span className="text-[10px] text-mist/60 font-medium">{label}</span>}
  </span>
)

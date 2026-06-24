import { useMemo } from 'react'
import { useRealtimeStore } from '@/store/realtimeStore'
import clsx from 'clsx'

const severityStyles: Record<string, string> = {
  critical: 'text-critical bg-critical/10',
  warning: 'text-warning bg-warning/10',
  success: 'text-success bg-success/10',
  info: 'text-mist/80 bg-navy/40',
}

const eventIcon: Record<string, string> = {
  risk_change: '\u25B3',
  decision: '\u25B7',
  alert: '\u26A0',
  intervention: '\u25B6',
  route_opt: '\u21BB',
  eta: '\u23F1',
  system: '\u25C8',
}

export const EventStreamTicker: React.FC = () => {
  const events = useRealtimeStore((s) => s.tickerEvents)
  const latest = useMemo(() => events.slice(0, 30), [events])

  if (latest.length === 0) return null

  return (
    <div className="h-7 bg-abyss border-t border-steel-grey/20 flex items-center overflow-hidden relative">
      <div className="shrink-0 flex items-center gap-1.5 px-2 h-full bg-abyss border-r border-steel-grey/20 z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className="text-[9px] font-semibold text-accent uppercase tracking-wider">Live</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-abyss via-transparent to-abyss pointer-events-none z-10" />
        <div className="flex items-center gap-4 animate-ticker whitespace-nowrap px-4"
          style={{ animationDuration: `${Math.max(latest.length * 3, 20)}s` }}>
          {latest.map((ev) => (
            <span key={ev.id} className="inline-flex items-center gap-1.5 text-[10px]">
              <span className={clsx(
                'w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold',
                severityStyles[ev.severity]?.split(' ')[0] || 'text-mist/60',
                severityStyles[ev.severity]?.split(' ')[1] || 'bg-navy/30',
              )}>
                {eventIcon[ev.type] || '\u25CF'}
              </span>
              <span className="text-mist/70 font-medium">{ev.title}</span>
              <span className="text-mist/40 max-w-[120px] truncate">{ev.detail}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

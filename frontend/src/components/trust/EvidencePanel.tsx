import { useState } from 'react'
import clsx from 'clsx'
import { CaretDown, CaretRight, SealCheck, WarningCircle, MinusCircle, Eye } from '@phosphor-icons/react'
import { DataFreshness } from './DataFreshness'
import { TrustBadge, TrustLevel } from './TrustBadge'

interface EvidenceItem {
  label: string
  value: string | number
  direction?: 'positive' | 'negative' | 'neutral'
  weight?: number
}

interface EvidencePanelProps {
  title: string
  items: EvidenceItem[]
  source?: string
  timestamp?: string | null
  trustLevel?: TrustLevel
  defaultOpen?: boolean
  loading?: boolean
  emptyMessage?: string
}

const dirConfig: Record<string, { color: string; icon: typeof SealCheck }> = {
  positive: { color: 'text-success', icon: SealCheck },
  negative: { color: 'text-critical', icon: WarningCircle },
  neutral: { color: 'text-mist/50', icon: MinusCircle },
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  title, items, source, timestamp, trustLevel, defaultOpen = false, loading, emptyMessage,
}) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-navy/30 border border-steel-grey/20 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-navy/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Eye size={12} className="text-accent" />
          <span className="text-[11px] font-semibold text-pearl">{title}</span>
          {trustLevel && <TrustBadge level={trustLevel} size="sm" />}
        </div>
        <div className="flex items-center gap-2">
          {timestamp && <DataFreshness timestamp={timestamp} compact maxAgeMs={60000} />}
          {open ? <CaretDown size={12} className="text-mist/50" /> : <CaretRight size={12} className="text-mist/50" />}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 animate-fade-in">
          {loading ? (
            <div className="space-y-1.5 py-2">
              <div className="h-2.5 bg-navy rounded w-full animate-pulse" />
              <div className="h-2.5 bg-navy rounded w-3/4 animate-pulse" />
              <div className="h-2.5 bg-navy rounded w-1/2 animate-pulse" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-[10px] text-mist/50 py-2">{emptyMessage || 'No evidence available'}</p>
          ) : (
            <>
              <div className="space-y-1">
                {items.map((item) => {
                  const dirCfg = dirConfig[item.direction || 'neutral']
                  const DirIcon = dirCfg.icon
                  return (
                    <div key={item.label} className="flex items-center gap-2 text-[10px] py-0.5">
                      <DirIcon size={10} className={clsx('shrink-0', dirCfg.color)} weight="fill" />
                      <span className="text-mist/70 min-w-[80px]">{item.label}</span>
                      <span className="text-pearl font-mono flex-1 text-right">{item.value}</span>
                      {item.weight !== undefined && (
                        <div className="w-12 h-1 bg-navy rounded-full overflow-hidden">
                          <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(item.weight * 100, 100)}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {source && (
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-steel-grey/20 mt-1.5">
                  <span className="text-[9px] text-mist/50">source:</span>
                  <span className="text-[9px] text-mist/70 font-mono">{source}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

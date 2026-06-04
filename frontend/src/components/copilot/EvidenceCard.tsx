import React from 'react'
import { ChartBar, MagnifyingGlass, Hash } from '@phosphor-icons/react'

interface EvidenceCardProps {
  evidence: string[]
  relatedOrderIds?: string[]
  relatedDriverIds?: string[]
  isExpanded?: boolean
}

function highlightEntities(text: string): React.ReactNode {
  const entityPattern = /(ORD-[A-Z0-9-]+|DRV-[A-Z0-9-]+)/g
  const parts = text.split(entityPattern)
  return parts.map((part, i) => {
    if (/^(ORD-|DRV-)/.test(part)) {
      return (
        <span
          key={i}
          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-accent/10 text-accent font-mono text-[10px] leading-none"
        >
          <Hash size={8} weight="bold" />
          {part}
        </span>
      )
    }
    return part
  })
}

export const EvidenceCard: React.FC<EvidenceCardProps> = ({
  evidence,
  relatedOrderIds,
  relatedDriverIds,
  isExpanded = false,
}) => {
  if (!evidence || evidence.length === 0) return null

  const displayEvidence = isExpanded ? evidence : evidence.slice(0, 3)

  return (
    <div className="bg-navy/50 border border-steel-grey/30 rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-steel-grey/20">
        <ChartBar size={11} className="text-mist" weight="fill" />
        <span className="text-[10px] font-semibold text-mist uppercase tracking-wider">
          Evidence
        </span>
        <span className="text-[10px] font-mono text-mist/50 ml-auto">
          {evidence.length} item{evidence.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="px-3 py-2">
        <ul className="space-y-1.5">
          {displayEvidence.map((item, idx) => (
            <li
              key={idx}
              className="text-[11px] text-cloud flex items-start gap-2 leading-relaxed"
            >
              <span className="w-1 h-1 rounded-full bg-accent/40 mt-[5px] shrink-0" />
              <span>{highlightEntities(item)}</span>
            </li>
          ))}
        </ul>

        {!isExpanded && evidence.length > 3 && (
          <p className="text-[10px] text-mist/60 mt-1.5 pl-3">
            +{evidence.length - 3} more items
          </p>
        )}
      </div>

      {(relatedOrderIds?.length || relatedDriverIds?.length) && (
        <div className="px-3 py-2 border-t border-steel-grey/20 flex flex-wrap gap-2">
          {relatedOrderIds && relatedOrderIds.length > 0 && (
            <div className="flex items-center gap-1">
              <MagnifyingGlass size={10} className="text-mist/60" />
              <span className="text-[10px] text-mist/60 mr-1">Orders:</span>
              {relatedOrderIds.slice(0, 3).map((id) => (
                <span
                  key={id}
                  className="text-[10px] font-mono px-1 py-0.5 rounded bg-accent/8 text-accent"
                >
                  {id}
                </span>
              ))}
              {relatedOrderIds.length > 3 && (
                <span className="text-[10px] text-mist/40">+{relatedOrderIds.length - 3}</span>
              )}
            </div>
          )}
          {relatedDriverIds && relatedDriverIds.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-mist/60 mr-1">Drivers:</span>
              {relatedDriverIds.slice(0, 2).map((id) => (
                <span
                  key={id}
                  className="text-[10px] font-mono px-1 py-0.5 rounded bg-teal-DEFAULT/8 text-teal-DEFAULT"
                >
                  {id}
                </span>
              ))}
              {relatedDriverIds.length > 2 && (
                <span className="text-[10px] text-mist/40">+{relatedDriverIds.length - 2}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
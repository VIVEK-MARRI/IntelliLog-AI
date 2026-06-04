import React from 'react'
import { ArrowUpRight, WarningCircle, SealCheck, Lightbulb } from '@phosphor-icons/react'

interface RecommendationPanelProps {
  recommendations: string[]
  confidence: number
  isExpanded?: boolean
}

const priorityIcon = (idx: number) => {
  if (idx === 0) return WarningCircle
  if (idx <= 2) return ArrowUpRight
  return Lightbulb
}

const priorityColors = [
  { border: 'border-critical-DEFAULT/30', bg: 'bg-critical-DEFAULT/8', dot: 'bg-critical-DEFAULT', label: 'Critical' },
  { border: 'border-warning-DEFAULT/30', bg: 'bg-warning-DEFAULT/8', dot: 'bg-warning-DEFAULT', label: 'High' },
  { border: 'border-accent/30', bg: 'bg-accent/8', dot: 'bg-accent', label: 'Medium' },
  { border: 'border-teal-DEFAULT/30', bg: 'bg-teal-DEFAULT/8', dot: 'bg-teal-DEFAULT', label: 'Info' },
  { border: 'border-teal-DEFAULT/30', bg: 'bg-teal-DEFAULT/8', dot: 'bg-teal-DEFAULT', label: 'Info' },
]

export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  recommendations,
  confidence,
  isExpanded = false,
}) => {
  if (!recommendations || recommendations.length === 0) return null

  const display = isExpanded ? recommendations : recommendations.slice(0, 3)

  return (
    <div className="bg-navy/50 border border-steel-grey/30 rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-steel-grey/20">
        <ArrowUpRight size={11} className="text-warning-DEFAULT" weight="bold" />
        <span className="text-[10px] font-semibold text-mist uppercase tracking-wider">
          Recommendations
        </span>
        <span className="text-[10px] font-mono text-mist/50 ml-auto">
          {recommendations.length} item{recommendations.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        {display.map((rec, idx) => {
          const Icon = priorityIcon(idx)
          const colors = priorityColors[Math.min(idx, priorityColors.length - 1)]
          return (
            <div
              key={idx}
              className={`flex items-start gap-2 px-2.5 py-2 rounded-lg ${colors.bg} border ${colors.border} transition-all duration-150 hover:border-opacity-60`}
            >
              <Icon
                size={12}
                weight={idx === 0 ? 'fill' : 'bold'}
                className={`mt-0.5 shrink-0 ${colors.dot.replace('bg-', 'text-')}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-cloud leading-relaxed">{rec}</p>
                {idx <= 2 && isExpanded && (
                  <span className={`text-[9px] font-semibold uppercase tracking-wider ${colors.dot.replace('bg-', 'text-')} mt-1 inline-block`}>
                    {colors.label} priority
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-steel-grey/20 bg-obsidian/30">
        <SealCheck size={10} className="text-accent" weight="fill" />
        <span className="text-[10px] text-mist">Confidence:</span>
        <div className="flex-1 max-w-[80px] h-1.5 rounded-full bg-obsidian overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              confidence >= 0.8 ? 'bg-success-DEFAULT' : confidence >= 0.6 ? 'bg-warning-DEFAULT' : 'bg-critical-DEFAULT'
            }`}
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
        <span className={`text-[10px] font-mono font-semibold ${
          confidence >= 0.8 ? 'text-success-DEFAULT' : confidence >= 0.6 ? 'text-warning-DEFAULT' : 'text-critical-DEFAULT'
        }`}>
          {(confidence * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  )
}
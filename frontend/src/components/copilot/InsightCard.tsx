import React from 'react'
import { CheckCircle, ArrowUpRight, ChartBar, Shield } from '@phosphor-icons/react'
import { CopilotResponse } from '../../types/copilot'

interface InsightCardProps {
  response: CopilotResponse
  isExpanded?: boolean
}

export const InsightCard: React.FC<InsightCardProps> = ({ response, isExpanded = false }) => {
  const confidenceColor = response.confidence >= 0.9
    ? 'text-success-DEFAULT'
    : response.confidence >= 0.75
      ? 'text-warning-DEFAULT'
      : 'text-critical-DEFAULT'

  const confidenceLabel = response.confidence >= 0.9 ? 'High'
    : response.confidence >= 0.75 ? 'Medium' : 'Standard'

  return (
    <div className="bg-navy border border-steel-grey/40 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-steel-grey/30">
        <div className="flex items-start gap-3">
          <CheckCircle size={16} weight="fill" className="text-accent mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-semibold text-pearl mb-1">Summary</h4>
            <p className="text-[12px] text-cloud leading-relaxed">{response.summary}</p>
          </div>
        </div>
      </div>

      {isExpanded && (
        <>
          {response.evidence && response.evidence.length > 0 && (
            <div className="px-4 py-3 border-b border-steel-grey/30">
              <div className="flex items-center gap-1.5 mb-2">
                <ChartBar size={12} className="text-mist" />
                <h4 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Evidence</h4>
              </div>
              <ul className="space-y-1">
                {response.evidence.map((item, idx) => (
                  <li key={idx} className="text-[11px] text-cloud flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-accent/50 mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {response.recommendations && response.recommendations.length > 0 && (
            <div className="px-4 py-3 border-b border-steel-grey/30">
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowUpRight size={12} className="text-warning-DEFAULT" />
                <h4 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Recommendations</h4>
              </div>
              <ul className="space-y-1.5">
                {response.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-[11px] text-cloud flex items-start gap-2">
                    <ArrowUpRight size={10} weight="bold" className="text-accent mt-0.5 shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className={`px-4 py-2.5 bg-obsidian/50 flex items-center justify-between ${isExpanded ? '' : 'border-t border-steel-grey/30'}`}>
        <div className="flex items-center gap-2 text-[11px]">
          <Shield size={12} className={confidenceColor} weight="fill" />
          <span className="text-mist">
            Confidence: <span className={`font-semibold ${confidenceColor}`}>{confidenceLabel} ({(response.confidence * 100).toFixed(0)}%)</span>
          </span>
        </div>
        <div className="text-[10px] text-mist">
          {response.sources?.slice(0, 2).join(', ')}
        </div>
      </div>
    </div>
  )
}

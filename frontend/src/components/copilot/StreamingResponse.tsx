import React from 'react'
import { Cpu } from '@phosphor-icons/react'
import type { CopilotStage } from '../../types/copilot'

interface StreamingResponseProps {
  stage: CopilotStage
  stageContent: string
  streamedContent: string
}

const stageMeta: Record<CopilotStage, { label: string; color: string }> = {
  idle: { label: 'Ready', color: 'text-mist' },
  connecting: { label: 'Connecting', color: 'text-warning-DEFAULT' },
  reconnecting: { label: 'Reconnecting', color: 'text-warning-DEFAULT' },
  thinking: { label: 'Thinking', color: 'text-accent' },
  gathering_context: { label: 'Gathering context', color: 'text-info-DEFAULT' },
  streaming: { label: 'Receiving', color: 'text-teal-DEFAULT' },
  complete: { label: 'Complete', color: 'text-success-DEFAULT' },
  error: { label: 'Error', color: 'text-critical-DEFAULT' },
  cancelled: { label: 'Cancelled', color: 'text-mist' },
}

export const StreamingResponse: React.FC<StreamingResponseProps> = ({
  stage,
  stageContent,
  streamedContent,
}) => {
  const meta = stageMeta[stage] || stageMeta.idle

  const isActive = stage === 'thinking' || stage === 'gathering_context' || stage === 'connecting' || stage === 'reconnecting' || stage === 'streaming'

  if (stage === 'idle' || stage === 'complete') return null

  return (
    <div className="flex justify-start">
      <div className="bg-navy border border-steel-grey/30 rounded-xl rounded-bl-md max-w-[85%] px-4 py-3 min-w-[200px]">
        <div className="flex items-center gap-1.5 mb-2">
          <Cpu size={12} weight="fill" className="text-accent" />
          <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">Copilot</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'animate-pulse' : ''} bg-${meta.color.replace('text-', '')}`} />
            <span className={`text-[11px] font-medium ${meta.color}`}>
              {stageContent || meta.label}
            </span>
            {isActive && (
              <div className="flex gap-0.5 ml-1">
                <span className="w-1 h-1 rounded-full bg-mist/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-mist/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-mist/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>

          {stage === 'gathering_context' && (
            <div className="flex gap-3 pt-0.5">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-1.5 rounded-full bg-accent/20 overflow-hidden">
                  <div className="h-full w-2/3 rounded-full bg-accent/40 animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {stage === 'streaming' && streamedContent && (
            <div className="pt-1">
              <p className="text-[12px] text-cloud leading-relaxed">{streamedContent}</p>
              <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-text-bottom" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
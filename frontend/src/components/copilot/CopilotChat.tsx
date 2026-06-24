import React, { useEffect, useRef } from 'react'
import { Cpu, CheckCircle, XCircle, Warning, Clock } from '@phosphor-icons/react'
import { StreamingResponse } from './StreamingResponse'
import { EvidenceCard } from './EvidenceCard'
import { RecommendationPanel } from './RecommendationPanel'
import type { CopilotMessage as CopilotMessageType, CopilotStage } from '../../types/copilot'

interface CopilotChatProps {
  messages: CopilotMessageType[]
  isLoading?: boolean
  loadingStage?: string
  streamStage?: CopilotStage
  streamStageContent?: string
  streamedContent?: string
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

const ConfidenceBadge: React.FC<{ confidence: number }> = ({ confidence }) => {
  const color = confidence >= 0.8 ? 'text-success-DEFAULT'
    : confidence >= 0.6 ? 'text-warning-DEFAULT'
    : 'text-critical-DEFAULT'
  const Icon = confidence >= 0.6 ? CheckCircle : XCircle
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${color}`}>
      <Icon size={10} weight="fill" />
      {(confidence * 100).toFixed(0)}% confidence
    </span>
  )
}

const LowConfidenceWarning: React.FC<{ confidence: number }> = ({ confidence }) => {
  if (confidence >= 0.5) return null
  return (
    <div className="flex items-start gap-1.5 p-2 rounded-lg bg-warning-DEFAULT/10 border border-warning-DEFAULT/30">
      <Warning size={12} weight="fill" className="text-warning-DEFAULT mt-0.5 shrink-0" />
      <p className="text-[10px] text-warning-DEFAULT leading-relaxed">
        Low confidence response. Verify before acting.
      </p>
    </div>
  )
}

const MessageContent: React.FC<{ message: CopilotMessageType }> = ({ message }) => {
  const { response } = message

  if (!response) {
    return <p className="text-sm text-pearl leading-relaxed">{message.content}</p>
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-pearl leading-relaxed">{response.summary}</p>

      <LowConfidenceWarning confidence={response.confidence} />

      {response.evidence && response.evidence.length > 0 && (
        <EvidenceCard
          evidence={response.evidence}
          validatedEvidence={message.validatedEvidence}
          relatedOrderIds={response.related_order_ids || response.affected_orders}
          relatedDriverIds={response.related_driver_ids || response.affected_drivers}
        />
      )}

      {response.recommendations && response.recommendations.length > 0 && (
        <RecommendationPanel
          recommendations={response.recommendations}
          confidence={response.confidence}
        />
      )}

      <div className="flex items-center gap-2 pt-1.5 border-t border-steel-grey/20">
        <ConfidenceBadge confidence={response.confidence} />
        {response.sources && response.sources.length > 0 && (
          <span className="text-[10px] font-mono text-mist/50">
            {response.sources.join(', ')}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-mist/50">
          <Clock size={10} />
          {timeAgo(message.timestamp)}
        </span>
      </div>
    </div>
  )
}

export const CopilotChat: React.FC<CopilotChatProps> = ({
  messages,
  isLoading = false,
  loadingStage,
  streamStage,
  streamStageContent,
  streamedContent,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamedContent])

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] px-4 py-3 rounded-xl text-sm ${
              message.type === 'user'
                ? 'bg-accent/15 text-pearl rounded-br-md border border-accent/20'
                : 'bg-navy text-pearl rounded-bl-md border border-steel-grey/30'
            }`}
          >
            {message.type === 'assistant' && (
              <div className="flex items-center gap-1.5 mb-2">
                <Cpu size={12} weight="fill" className="text-accent" />
                <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">Copilot</span>
              </div>
            )}
            <MessageContent message={message} />
            {message.timestamp && (
              <p className={`text-[10px] mt-1.5 ${message.type === 'user' ? 'text-accent/50' : 'text-mist/50'}`}>
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
      ))}

      {streamStage && streamStage !== 'idle' && streamStage !== 'complete' && streamStage !== 'cancelled' && (
        <StreamingResponse
          stage={streamStage}
          stageContent={streamStageContent || ''}
          streamedContent={streamedContent || ''}
        />
      )}

      {streamStage === 'cancelled' && (
        <div className="flex justify-start">
          <div className="bg-navy/50 border border-steel-grey/30 rounded-xl rounded-bl-md px-4 py-3 max-w-[85%]">
            <p className="text-[11px] text-mist italic">Response cancelled</p>
          </div>
        </div>
      )}

      {isLoading && !streamStage && (
        <div className="flex justify-start">
          <div className="bg-navy text-pearl rounded-xl rounded-bl-md border border-steel-grey/30 px-4 py-3 space-y-1 max-w-[85%]">
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu size={12} weight="fill" className="text-accent" />
              <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">Copilot</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-mist">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {loadingStage || 'Processing...'}
            </div>
            <div className="flex gap-1 pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-mist/40 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-mist/40 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-mist/40 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

import React, { useEffect, useRef } from 'react'
import { fleetStore } from '@/store/fleetStore'
import { AgentDecision } from '@/types/api'
import { format } from 'date-fns'
import clsx from 'clsx'

interface DecisionLogProps {
  maxEntries?: number
  highlightOrderId?: string
}

export const DecisionLog: React.FC<DecisionLogProps> = ({
  maxEntries = 50,
  highlightOrderId,
}) => {
  const decisions = fleetStore((state) => state.agentDecisions)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [decisions])

  useEffect(() => {
    if (decisions.length > maxEntries) {
      fleetStore.getState().clearOldDecisions(maxEntries)
    }
  }, [decisions.length, maxEntries])

  const limitedDecisions = decisions.slice(0, maxEntries)

  if (limitedDecisions.length === 0) {
    return (
      <div className="bg-abyss rounded border border-steel-grey/30 p-6 text-center min-h-64 flex items-center justify-center">
        <p className="text-mist/60">No agent decisions yet</p>
      </div>
    )
  }


  return (
    <div className="bg-abyss rounded border border-steel-grey/30 overflow-hidden flex flex-col h-full">
      <div className="bg-obsidian border-b border-steel-grey/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-cloud uppercase tracking-wider">
          Agent Decision Log
        </h3>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto max-h-96"
      >
        <div className="divide-y divide-steel-grey/20">
          {limitedDecisions.map((decision, idx) => (
            <DecisionLogEntry
              key={`${decision.id}-${idx}`}
              decision={decision}
              isHighlighted={decision.order_id === highlightOrderId}
            />
          ))}
        </div>
      </div>

      <div className="bg-obsidian border-t border-steel-grey/30 px-4 py-2 text-xs text-mist/60">
        {limitedDecisions.length} decision{limitedDecisions.length !== 1 ? 's' : ''} &bull; Auto-refreshing
      </div>
    </div>
  )
}

interface DecisionLogEntryProps {
  decision: AgentDecision
  isHighlighted?: boolean
}

const DecisionLogEntry: React.FC<DecisionLogEntryProps> = React.memo(({
  decision,
  isHighlighted,
}) => {
  const timestamp = format(new Date(decision.created_at), 'HH:mm:ss')

  const decisionColor = {
    no_action: 'bg-steel-grey text-cloud',
    alert: 'bg-warning-DEFAULT/20 text-warning-DEFAULT',
    reroute: 'bg-accent/20 text-accent',
  }

  const decisionLabel = {
    no_action: 'No Action',
    alert: 'Alert Sent',
    reroute: 'Rerouted',
  }

  const riskColor = decision.risk_score > 0.7
    ? 'text-critical-DEFAULT'
    : decision.risk_score > 0.3
    ? 'text-warning-DEFAULT'
    : 'text-success-DEFAULT'

  return (
    <div
      className={clsx(
        'px-4 py-3 hover:bg-navy/50 transition-colors',
        isHighlighted && 'bg-accent/5'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-mist/60">{timestamp}</span>
            <span className={clsx(
              'inline-block px-2 py-0.5 rounded text-xs font-semibold',
              decisionColor[decision.decision_type]
            )}>
              {decisionLabel[decision.decision_type]}
            </span>
          </div>

          <p className="text-xs text-mist font-mono mb-1">
            Order: {decision.order_id}
          </p>

          <p className="text-xs text-mist/80 line-clamp-2">
            {decision.reasoning}
          </p>

          <div className="flex items-center gap-3 mt-2">
            <span className={clsx('text-xs font-semibold', riskColor)}>
              Risk: {(decision.risk_score * 100).toFixed(0)}%
            </span>
            <span className="text-xs text-mist/60">
              {decision.latency_ms}ms
            </span>
            {decision.impact?.time_saved_minutes && (
              <span className="text-xs text-success-DEFAULT">
                Saved: {decision.impact.time_saved_minutes.toFixed(0)}m
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

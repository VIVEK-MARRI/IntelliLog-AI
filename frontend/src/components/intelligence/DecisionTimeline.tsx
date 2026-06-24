import React, { useMemo, useState, useCallback } from 'react'
import { fleetStore } from '@/store/fleetStore'
import { AgentDecision } from '@/types/api'
import { format } from 'date-fns'
import { Brain, AlertTriangle, Route, Minus, Search, ChevronLeft, ChevronRight, Clock, Cpu } from 'lucide-react'
import clsx from 'clsx'

const DECISION_FILTERS = [
  { key: 'all', label: 'All', icon: null },
  { key: 'reroute', label: 'Reroute', icon: Route },
  { key: 'alert', label: 'Alert', icon: AlertTriangle },
  { key: 'no_action', label: 'No Action', icon: Minus },
] as const

type DecisionFilter = (typeof DECISION_FILTERS)[number]['key']
const PAGE_SIZE = 10

const formatOrderId = (id: string): string => (id?.length > 7 ? id.slice(0, 7).toUpperCase() : id?.toUpperCase() ?? '??')

interface TimelineNodeProps {
  type: 'no_action' | 'alert' | 'reroute'
}

const TimelineNode: React.FC<TimelineNodeProps> = ({ type }) => {
  const colors = {
    no_action: 'border-slate-500/30 text-slate-400',
    alert: 'border-warning/50 text-warning',
    reroute: 'border-accent/50 text-accent',
  }
  const icons = {
    no_action: Minus,
    alert: AlertTriangle,
    reroute: Route,
  }
  const Icon = icons[type]

  return (
    <div className="flex flex-col items-center">
      <div className={clsx(
        'w-9 h-9 rounded-full border-2 flex items-center justify-center bg-abyss',
        colors[type]
      )}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
  )
}

interface DecisionEntryProps {
  decision: AgentDecision
}

const DecisionEntry: React.FC<DecisionEntryProps> = React.memo(({ decision }) => {
  const [expanded, setExpanded] = useState(false)
  const time = format(new Date(decision.created_at), 'HH:mm')
  const date = format(new Date(decision.created_at), 'MMM dd')
  const riskPct = (decision.risk_score * 100).toFixed(0)

  const badgeStyle = {
    no_action: 'bg-steel-grey/30 text-mist border border-steel-grey/40',
    alert: 'bg-warning-bg text-warning border border-warning-border',
    reroute: 'bg-accent/15 text-accent border border-accent/30',
  }

  const badgeLabel = {
    no_action: 'No Action',
    alert: 'Alert Sent',
    reroute: 'Rerouted',
  }

  return (
    <div className="relative pl-12 pb-2">
      <div className="absolute left-[17px] top-9 bottom-0 w-px bg-steel-grey/20" />
      <div className="absolute left-0 top-0">
        <TimelineNode type={decision.decision_type} />
      </div>

      <div
        className="bg-navy/40 border border-steel-grey/20 rounded-lg p-3.5 hover:border-steel-grey/40 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[11px] font-mono text-mist/60 whitespace-nowrap">{date} {time}</span>
            <span className="text-[11px] font-mono font-medium text-cloud truncate">
              {formatOrderId(decision.order_id)}
            </span>
            <span className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold', badgeStyle[decision.decision_type])}>
              {badgeLabel[decision.decision_type]}
            </span>
          </div>
          <span className={clsx(
            'text-sm font-bold font-mono',
            decision.risk_score > 0.7 ? 'text-critical' : decision.risk_score > 0.3 ? 'text-warning' : 'text-success'
          )}>
            {riskPct}%
          </span>
        </div>

        <p className={clsx(
          'text-xs text-mist/80 leading-relaxed',
          expanded ? '' : 'line-clamp-2'
        )}>
          {decision.reasoning || 'No reasoning provided'}
        </p>

        <div className="flex items-center gap-3 mt-2.5">
          <div className="flex-1 h-1.5 bg-navy rounded-full overflow-hidden max-w-[120px]">
            <div
              className={clsx(
                'h-full rounded-full',
                decision.risk_score > 0.7 ? 'bg-critical/60' : decision.risk_score > 0.3 ? 'bg-warning/60' : 'bg-success/60'
              )}
              style={{ width: `${Math.min(decision.risk_score * 100, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-mist/60 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {decision.latency_ms}ms
          </span>
          <span className={clsx(
            'text-[10px] font-medium',
            decision.outcome === 'success' ? 'text-success' : decision.outcome === 'failed' ? 'text-critical' : 'text-warning'
          )}>
            {decision.outcome}
          </span>
        </div>

        {expanded && decision.tools_invoked && decision.tools_invoked.length > 0 && (
          <div className="mt-3 pt-3 border-t border-steel-grey/20 flex flex-wrap gap-1.5">
            {decision.tools_invoked.map((tool) => (
              <span
                key={tool}
                className="text-[10px] font-mono text-mist bg-navy border border-steel-grey/30 px-2 py-0.5 rounded"
              >
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

export const DecisionTimeline: React.FC = () => {
  const decisions = fleetStore((state) => state.agentDecisions)
  const connectionStatus = fleetStore((state) => state.connectionStatus)
  const connected = connectionStatus === 'connected'

  const [filter, setFilter] = useState<DecisionFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filteredDecisions = useMemo(() => {
    let result = decisions

    if (filter !== 'all') {
      result = result.filter((d) => d.decision_type === filter)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (d) =>
          d.order_id.toLowerCase().includes(q) ||
          d.reasoning.toLowerCase().includes(q)
      )
    }

    return result
  }, [decisions, filter, search])

  const totalPages = Math.max(1, Math.ceil(filteredDecisions.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = useMemo(
    () => filteredDecisions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredDecisions, safePage]
  )

  const handlePageChange = useCallback((p: number) => {
    setPage(Math.max(1, Math.min(p, totalPages)))
  }, [totalPages])

  const decisionTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: decisions.length }
    for (const d of decisions) {
      counts[d.decision_type] = (counts[d.decision_type] ?? 0) + 1
    }
    return counts
  }, [decisions])

  if (!connected && decisions.length === 0) {
    return (
      <div className="bg-abyss border border-steel-grey/30 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-steel-grey/30">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-accent" />
            <h3 className="text-base font-bold text-pearl">Agent Decision Timeline</h3>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-14 text-center px-6">
          <Cpu className="w-10 h-10 text-mist/30 mb-3" />
          <p className="text-mist font-medium">No decisions recorded</p>
          <p className="text-xs text-mist/60 mt-1">Agent decisions appear here when orders are being processed</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-abyss border border-steel-grey/30 rounded-xl overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-steel-grey/30 bg-obsidian/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-accent" />
            <h3 className="text-base font-bold text-pearl">Agent Decision Timeline</h3>
            <span className={clsx(
              'text-[10px] px-1.5 py-0.5 rounded font-mono',
              connected ? 'bg-success-bg text-success' : 'bg-critical-bg text-critical'
            )}>
              {connected ? 'Live' : 'Off'}
            </span>
          </div>
          <span className="text-xs text-mist/60">{decisions.length} decision{decisions.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mist/50" />
            <input
              type="text"
              placeholder="Search order ID or reasoning..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full bg-navy border border-steel-grey/30 rounded text-xs text-pearl pl-8 pr-3 py-1.5 placeholder:text-mist/40 focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 px-5 py-2.5 border-b border-steel-grey/20 overflow-x-auto scrollbar-hide">
        {DECISION_FILTERS.map((f) => {
          const count = decisionTypeCounts[f.key] ?? 0
          const Icon = f.icon
          return (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(1) }}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium transition-all whitespace-nowrap',
                filter === f.key
                  ? f.key === 'all'
                    ? 'bg-accent/15 text-accent border border-accent/20'
                    : f.key === 'reroute'
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : f.key === 'alert'
                    ? 'bg-warning-bg text-warning border border-warning-border'
                    : 'bg-navy text-cloud border border-steel-grey/30'
                  : 'text-mist hover:text-cloud hover:bg-navy border border-transparent'
              )}
            >
              {Icon && <Icon className="w-3 h-3" />}
              <span>{f.label}</span>
              {count > 0 && <span className="text-[10px] text-mist/50">({count})</span>}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1 scrollbar-hide min-h-[300px]">
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Brain className="w-8 h-8 text-mist/30 mb-2" />
            <p className="text-sm text-mist font-medium">
              {search ? 'No matching decisions' : filter !== 'all' ? `No ${filter} decisions` : 'No decisions yet'}
            </p>
          </div>
        ) : (
          paginated.map((decision, idx) => (
            <DecisionEntry
              key={decision.id || `${decision.order_id}-${idx}`}
              decision={decision}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-steel-grey/20 bg-obsidian/30">
          <span className="text-[11px] text-mist/60">
            {filteredDecisions.length} result{filteredDecisions.length !== 1 ? 's' : ''}
            {filter !== 'all' ? ` (${filter})` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(safePage - 1)}
              disabled={safePage <= 1}
              className="w-7 h-7 rounded flex items-center justify-center text-mist hover:text-cloud hover:bg-navy disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-mist font-mono">{safePage} / {totalPages}</span>
            <button
              onClick={() => handlePageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              className="w-7 h-7 rounded flex items-center justify-center text-mist hover:text-cloud hover:bg-navy disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useMemo } from 'react'
import { fleetStore } from '@/store/fleetStore'
import { Brain, Warning, ArrowsLeftRight, CheckCircle } from '@phosphor-icons/react'
import clsx from 'clsx'

const DECISION_COLORS: Record<string, string> = {
  reroute: 'bg-critical/60',
  alert: 'bg-warning/60',
  no_action: 'bg-mist/30',
}

const DECISION_TEXT: Record<string, string> = {
  reroute: 'text-critical',
  alert: 'text-warning',
  no_action: 'text-mist',
}

export const AgentIntelligence: React.FC = () => {
  const decisions = fleetStore((s) => s.agentDecisions)

  const stats = useMemo(() => {
    const total = decisions.length
    const byType: Record<string, number> = { reroute: 0, alert: 0, no_action: 0 }
    const byOutcome: Record<string, number> = { success: 0, pending: 0, failed: 0 }
    let totalTimeSaved = 0

    for (const d of decisions) {
      byType[d.decision_type] = (byType[d.decision_type] ?? 0) + 1
      byOutcome[d.outcome] = (byOutcome[d.outcome] ?? 0) + 1
      if (d.impact?.time_saved_minutes) totalTimeSaved += d.impact.time_saved_minutes
    }

    const safe = total || 1
    return {
      total,
      rerouteCount: byType.reroute,
      alertCount: byType.alert,
      noActionCount: byType.no_action,
      rerouteRate: (byType.reroute / safe) * 100,
      alertRate: (byType.alert / safe) * 100,
      successCount: byOutcome.success,
      successRate: (byOutcome.success / safe) * 100,
      totalTimeSaved,
    }
  }, [decisions])

  const typeDistribution = useMemo(() => {
    const total = stats.total || 1
    return [
      { label: 'Reroute', count: stats.rerouteCount, pct: (stats.rerouteCount / total) * 100, color: DECISION_COLORS.reroute, textColor: DECISION_TEXT.reroute },
      { label: 'Alert', count: stats.alertCount, pct: (stats.alertCount / total) * 100, color: DECISION_COLORS.alert, textColor: DECISION_TEXT.alert },
      { label: 'No Action', count: stats.noActionCount, pct: (stats.noActionCount / total) * 100, color: DECISION_COLORS.no_action, textColor: DECISION_TEXT.no_action },
    ]
  }, [stats])

  return (
    <div className="space-y-5">
      <div className="bg-abyss border border-steel-grey/30 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-pearl mb-4 flex items-center gap-2">
          <Brain size={14} className="text-accent" />
          Agent Decisions by Type
        </h3>
        {stats.total === 0 ? (
          <div className="flex items-center justify-center py-6 text-center">
            <Brain size={20} className="text-mist/30 mb-1" />
            <p className="text-xs text-mist/60">No agent decisions recorded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {typeDistribution.map((item) => (
              <div key={item.label}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className={clsx('text-xs font-medium', item.textColor)}>{item.label}</span>
                  <span className="text-xs font-mono text-cloud">{item.count} ({item.pct.toFixed(0)}%)</span>
                </div>
                <div className="w-full bg-navy rounded-full h-2 overflow-hidden">
                  <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
            <p className="text-[10px] text-mist/60 mt-2">{stats.total} total decisions</p>
          </div>
        )}
      </div>

      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowsLeftRight size={12} className="text-critical" />
              <h3 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Reroute Rate</h3>
            </div>
            <p className="text-xl font-bold font-mono text-critical">{stats.rerouteRate.toFixed(0)}%</p>
            <p className="text-[10px] text-mist/60 mt-1">{stats.rerouteCount} of {stats.total}</p>
          </div>

          <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Warning size={12} className="text-warning" />
              <h3 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Alert Rate</h3>
            </div>
            <p className="text-xl font-bold font-mono text-warning">{stats.alertRate.toFixed(0)}%</p>
            <p className="text-[10px] text-mist/60 mt-1">{stats.alertCount} of {stats.total}</p>
          </div>

          <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={12} className="text-success" />
              <h3 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Success Rate</h3>
            </div>
            <p className="text-xl font-bold font-mono text-success">{stats.successRate.toFixed(0)}%</p>
            <p className="text-[10px] text-mist/60 mt-1">{stats.successCount} of {stats.total}</p>
          </div>
        </div>
      )}

      {stats.totalTimeSaved > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-accent" />
            <span className="text-xs font-semibold text-accent">Total time saved by agent interventions</span>
          </div>
          <p className="text-lg font-bold text-pearl font-mono">{stats.totalTimeSaved} min</p>
        </div>
      )}
    </div>
  )
}

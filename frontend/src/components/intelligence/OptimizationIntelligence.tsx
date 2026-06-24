import React, { useMemo } from 'react'
import { fleetStore } from '@/store/fleetStore'
import { Clock, ArrowsLeftRight, CheckCircle, Gauge } from '@phosphor-icons/react'
import clsx from 'clsx'

export const OptimizationIntelligence: React.FC = () => {
  const decisions = fleetStore((s) => s.agentDecisions)

  const stats = useMemo(() => {
    const reroutes = decisions.filter((d) => d.decision_type === 'reroute')
    const totalTimeSaved = reroutes.reduce((s, d) => s + (d.impact?.time_saved_minutes ?? 0), 0)
    const totalRiskReduced = reroutes.reduce((s, d) => s + (d.impact?.risk_reduction ?? 0), 0)
    const successful = decisions.filter((d) => d.outcome === 'success')
    const failed = decisions.filter((d) => d.outcome === 'failed')
    const total = decisions.length || 1

    return {
      totalDecisions: decisions.length,
      rerouteCount: reroutes.length,
      successCount: successful.length,
      failCount: failed.length,
      successRate: (successful.length / total) * 100,
      totalTimeSaved,
      totalRiskReduced,
      avgTimeSaved: reroutes.length > 0 ? totalTimeSaved / reroutes.length : 0,
      avgRiskReduced: reroutes.length > 0 ? totalRiskReduced / reroutes.length : 0,
    }
  }, [decisions])

  if (stats.totalDecisions === 0) {
    return (
      <div className="space-y-5">
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-6 text-center">
          <ArrowsLeftRight size={24} className="text-mist/30 mx-auto mb-2" />
          <p className="text-sm text-mist font-medium">No optimization data yet</p>
          <p className="text-xs text-mist/60 mt-1">Route optimization metrics will appear after agent interventions</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={12} className="text-accent" />
            <h3 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Time Saved</h3>
          </div>
          <p className="text-xl font-bold font-mono text-pearl">{stats.totalTimeSaved} min</p>
          <p className="text-[10px] text-mist/60 mt-1">
            {stats.rerouteCount > 0 ? `avg ${stats.avgTimeSaved.toFixed(0)}m per reroute` : '—'}
          </p>
        </div>

        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowsLeftRight size={12} className="text-success" />
            <h3 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Reroutes</h3>
          </div>
          <p className="text-xl font-bold font-mono text-pearl">{stats.rerouteCount}</p>
          <p className="text-[10px] text-mist/60 mt-1">of {stats.totalDecisions} total decisions</p>
        </div>

        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={12} className="text-success" />
            <h3 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Success Rate</h3>
          </div>
          <p className={clsx('text-xl font-bold font-mono', stats.successRate >= 80 ? 'text-success' : 'text-warning')}>
            {stats.successRate.toFixed(0)}%
          </p>
          <p className="text-[10px] text-mist/60 mt-1">{stats.successCount} successful · {stats.failCount} failed</p>
        </div>

        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge size={12} className="text-accent" />
            <h3 className="text-[10px] font-semibold text-mist uppercase tracking-wider">Risk Reduction</h3>
          </div>
          <p className="text-xl font-bold font-mono text-pearl">
            {stats.totalRiskReduced > 0 ? `-${(stats.totalRiskReduced / stats.rerouteCount).toFixed(0)}%` : '—'}
          </p>
          <p className="text-[10px] text-mist/60 mt-1">avg per reroute</p>
        </div>
      </div>

      <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge size={14} className="text-accent" />
            <span className="text-xs font-semibold text-mist uppercase tracking-wider">Optimization Success</span>
          </div>
          <span className={clsx('text-xs font-semibold', stats.successRate >= 80 ? 'text-success' : 'text-warning')}>
            {stats.successRate.toFixed(0)}%
          </span>
        </div>
        <div className="mt-2 w-full bg-navy rounded-full h-3 overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all', stats.successRate >= 80 ? 'bg-success/60' : 'bg-warning/60')}
            style={{ width: `${Math.min(stats.successRate, 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-mist/60 mt-2">
          {stats.successCount} of {stats.totalDecisions} agent decisions completed successfully
        </p>
      </div>
    </div>
  )
}

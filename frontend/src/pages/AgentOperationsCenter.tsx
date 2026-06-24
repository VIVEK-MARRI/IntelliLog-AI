import React, { useEffect, useState, useCallback, useMemo } from 'react'
import clsx from 'clsx'
import {
  Robot, Graph, MagnifyingGlass,
  XCircle, CheckCircle, WarningCircle,
  ChartBar, Star,
  Cpu, Pulse,
} from '@phosphor-icons/react'
import { agentOpsAPI } from '@/api/agentOps'
import type {
  AgentOpsResponse, AgentSummaryEntry,
} from '@/types/api'

type SectionStatus = 'loading' | 'error' | 'ok'

// ─── Helpers ──────────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`
}

function pct1(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

// ─── Section card wrapper ────────────────────────────────────────────────

const SectionCard: React.FC<{
  title: string
  icon: React.ReactNode
  status?: SectionStatus
  error?: string
  children: React.ReactNode
  className?: string
}> = ({ title, icon, status, error, children, className }) => (
  <div className={clsx('bg-abyss border border-steel-grey/30 rounded-xl overflow-hidden', className)}>
    <div className="flex items-center gap-2 px-4 py-3 border-b border-steel-grey/20">
      <span className="text-accent">{icon}</span>
      <h3 className="text-sm font-semibold text-pearl">{title}</h3>
      {status === 'loading' && <span className="ml-auto w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
    </div>
    <div className="p-4">
      {status === 'error' ? (
        <div className="flex items-center gap-2 text-xs text-critical">
          <XCircle className="w-4 h-4" weight="fill" />
          <span>{error || 'Failed to load'}</span>
        </div>
      ) : (
        children
      )}
    </div>
  </div>
)

// ─── Mini bar ─────────────────────────────────────────────────────────────

const MiniBar: React.FC<{ value: number; max: number; color?: string }> = ({
  value, max, color = 'bg-accent',
}) => (
  <div className="w-full h-1.5 bg-navy/50 rounded-full overflow-hidden">
    <div className={clsx('h-full rounded-full transition-all duration-500', color)}
      style={{ width: `${Math.min((value / max) * 100, 100)}%` }} />
  </div>
)

// ─── Metric tile ──────────────────────────────────────────────────────────

const MetricTile: React.FC<{
  label: string; value: string | number; color?: string; subtitle?: string; icon?: React.ReactNode
}> = ({ label, value, color = 'text-pearl', subtitle, icon }) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex items-center gap-1 text-[10px] text-mist/60 uppercase tracking-wider font-medium">
      {icon && <span className="text-mist/40">{icon}</span>}
      {label}
    </div>
    <span className={clsx('text-lg font-semibold font-mono leading-none', color)}>{value}</span>
    {subtitle && <span className="text-[10px] text-mist/40">{subtitle}</span>}
  </div>
)

// ─── Agent card ───────────────────────────────────────────────────────────

const AgentCard: React.FC<{
  agent: AgentSummaryEntry; icon: React.ReactNode; color: string
}> = ({ agent, icon, color }) => (
  <div className="bg-navy/30 rounded-lg border border-steel-grey/20 p-3.5 flex flex-col gap-2.5">
    <div className="flex items-center gap-2">
      <span className={clsx('w-7 h-7 rounded flex items-center justify-center', color)}>
        {icon}
      </span>
      <span className="text-sm font-semibold text-pearl">{agent.name}</span>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <MetricTile label="Decisions" value={agent.total_decisions} />
      <MetricTile label="Success" value={pct(agent.success_rate)} color={agent.success_rate > 0.8 ? 'text-success' : 'text-warning'} />
      <MetricTile label="Latency" value={fmtMs(agent.avg_latency_ms)} />
      <MetricTile label="Failures" value={agent.failures} color={agent.failures > 0 ? 'text-critical' : 'text-mist/50'} />
    </div>
    <MiniBar value={agent.success_rate} max={1} color={agent.success_rate > 0.8 ? 'bg-success' : 'bg-warning'} />
  </div>
)

// ─── Main component ───────────────────────────────────────────────────────

export const AgentOperationsCenter: React.FC = () => {
  const [data, setData] = useState<AgentOpsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, SectionStatus>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')

  const fetchOps = useCallback(async () => {
    try {
      const result = await agentOpsAPI.getAgentOps()
      setData(result)
      setError(null)
      setStatuses({
        summary: 'ok', volume: 'ok', outcomes: 'ok', tools: 'ok',
        leaderboard: 'ok', explorer: 'ok', failures: 'ok',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch agent operations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOps()
    const interval = setInterval(fetchOps, 15000)
    return () => clearInterval(interval)
  }, [fetchOps])

  // Filtered decisions
  const filteredDecisions = useMemo(() => {
    if (!data) return []
    let items = data.decision_explorer.decisions
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      items = items.filter(d =>
        d.order_id.toLowerCase().includes(q) ||
        d.decision_type.toLowerCase().includes(q) ||
        d.agent_type.toLowerCase().includes(q) ||
        d.outcome.toLowerCase().includes(q)
      )
    }
    if (filterType !== 'all') {
      items = items.filter(d => d.decision_type === filterType)
    }
    return items
  }, [data, searchQuery, filterType])

  // Loading skeleton
  if (loading && !data) {
    return (
      <div className="h-full flex flex-col gap-3 p-4 overflow-y-auto scrollbar-hide">
        <div className="flex items-center gap-3 mb-2">
          <Robot className="w-5 h-5 text-accent" weight="fill" />
          <h1 className="text-lg font-semibold text-pearl">Agent Operations Center</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-abyss border border-steel-grey/30 rounded-xl p-4 animate-pulse">
              <div className="h-4 w-32 bg-navy rounded mb-4" />
              <div className="space-y-2">
                <div className="h-3 bg-navy rounded w-full" />
                <div className="h-3 bg-navy rounded w-3/4" />
                <div className="h-3 bg-navy rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="bg-critical-bg border border-critical-border rounded-xl p-6 max-w-md text-center">
          <XCircle className="w-10 h-10 text-critical mx-auto mb-3" weight="fill" />
          <h3 className="text-base font-semibold text-pearl mb-1">Agent Ops Unavailable</h3>
          <p className="text-sm text-mist">{error}</p>
          <button onClick={fetchOps}
            className="mt-4 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const summary = data?.agent_summary ?? []
  const volume = data?.decision_volume
  const outcomes = data?.decision_outcomes ?? []
  const tools = data?.tool_usage ?? []
  const leaderboard = data?.leaderboard ?? []
  const failures = data?.failure_analysis
  const maxToolCount = Math.max(...tools.map(t => t.count), 1)
  const maxVolume = Math.max(...(volume?.hourly_buckets ?? []).map(b => b.count), 1)

  return (
    <div className="h-full flex flex-col gap-3 p-4 overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Robot className="w-5 h-5 text-accent" weight="fill" />
          <h1 className="text-lg font-semibold text-pearl">Agent Operations Center</h1>
          {data && (
            <span className="text-[10px] text-mist/50 font-mono">
              updated {new Date(data.generated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
        <span className="text-[10px] text-mist/30 font-mono">
          {volume?.total_decisions ?? 0} total decisions
        </span>
      </div>

      {/* Section 1: Agent Summary */}
      <SectionCard title="Agent Summary" icon={<Robot className="w-4 h-4" weight="fill" />} status={statuses.summary}>
        {summary.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.map(a => (
              <AgentCard key={a.name} agent={a}
                icon={a.name === 'Risk Agent' ? <WarningCircle className="w-3.5 h-3.5 text-warning" weight="fill" /> :
                  a.name === 'Optimization Agent' ? <Graph className="w-3.5 h-3.5 text-info" weight="fill" /> :
                    <Star className="w-3.5 h-3.5 text-accent" weight="fill" />}
                color={a.name === 'Risk Agent' ? 'bg-warning-bg' :
                  a.name === 'Optimization Agent' ? 'bg-info-bg' : 'bg-accent-bg'} />
            ))}
          </div>
        ) : (
          <div className="text-xs text-mist/60 py-2">No agent decision data available</div>
        )}
      </SectionCard>

      {/* Sections 2-4: Three-column analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Section 2: Decision Volume */}
        <SectionCard title="Decision Volume" icon={<Pulse className="w-4 h-4" weight="fill" />} status={statuses.volume}>
          {volume ? (
            <div className="space-y-3">
              <MetricTile label="Avg Rate" value={`${volume.decisions_per_hour}/h`} icon={<Pulse className="w-3 h-3" />} subtitle={`${volume.total_decisions} total`} />
              {volume.hourly_buckets.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-mist/50 uppercase tracking-wider font-medium">Hourly Trend</div>
                  <div className="flex items-end gap-[2px] h-16">
                    {volume.hourly_buckets.slice(-24).map((b) => (
                      <div key={b.hour}
                        className="flex-1 bg-accent/60 hover:bg-accent transition-colors rounded-t relative group cursor-pointer"
                        style={{ height: `${(b.count / maxVolume) * 100}%` }}>
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-mist/60 opacity-0 group-hover:opacity-100 whitespace-nowrap font-mono">
                          {b.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </SectionCard>

        {/* Section 3: Decision Outcomes */}
        <SectionCard title="Decision Outcomes" icon={<ChartBar className="w-4 h-4" weight="fill" />} status={statuses.outcomes}>
          {outcomes.length > 0 ? (
            <div className="space-y-3">
              <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                {outcomes.map(o => {
                  const total = outcomes.reduce((s, x) => s + x.count, 0)
                  const pctW = total > 0 ? (o.count / total) * 100 : 0
                  return (
                    <div key={o.outcome} className={clsx(
                      o.outcome === 'success' ? 'bg-success' :
                      o.outcome === 'failed' ? 'bg-critical' : 'bg-mist/40'
                    )} style={{ width: `${pctW}%` }} />
                  )
                })}
              </div>
              <div className="space-y-1.5">
                {outcomes.map(o => {
                  const total = outcomes.reduce((s, x) => s + x.count, 0)
                  return (
                    <div key={o.outcome} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className={clsx('w-2 h-2 rounded-full',
                          o.outcome === 'success' ? 'bg-success' :
                          o.outcome === 'failed' ? 'bg-critical' : 'bg-mist/40')} />
                        <span className="capitalize text-mist/80">{o.outcome}</span>
                      </span>
                      <span className="font-mono text-pearl">{o.count} <span className="text-mist/40">({total > 0 ? ((o.count / total) * 100).toFixed(0) : 0}%)</span></span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-mist/60 py-2">No outcome data</div>
          )}
        </SectionCard>

        {/* Section 4: Tool Usage */}
        <SectionCard title="Tool Usage" icon={<Cpu className="w-4 h-4" weight="fill" />} status={statuses.tools}>
          {tools.length > 0 ? (
            <div className="space-y-2.5">
              {tools.map(t => (
                <div key={t.tool} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-mist/80">{t.tool}</span>
                    <span className="font-mono text-pearl">{t.count}</span>
                  </div>
                  <MiniBar value={t.count} max={maxToolCount} color={
                    t.tool === 'Redis' ? 'bg-accent' :
                    t.tool === 'Prediction Engine' ? 'bg-warning' :
                    t.tool === 'Route Optimizer' ? 'bg-info' : 'bg-success'
                  } />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-mist/60 py-2">No tool usage data</div>
          )}
        </SectionCard>
      </div>

      {/* Section 5: Agent Leaderboard */}
      <SectionCard title="Agent Leaderboard" icon={<Star className="w-4 h-4" weight="fill" />} status={statuses.leaderboard}>
        {leaderboard.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-mist/50 uppercase tracking-wider border-b border-steel-grey/20">
                  <th className="text-left py-2 pr-3 font-medium">Rank</th>
                  <th className="text-left py-2 pr-3 font-medium">Agent</th>
                  <th className="text-right py-2 pr-3 font-medium">Impact</th>
                  <th className="text-right py-2 pr-3 font-medium">Success Rate</th>
                  <th className="text-right py-2 pr-3 font-medium">Time Saved</th>
                  <th className="text-right py-2 font-medium">Decisions</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(entry => (
                  <tr key={entry.rank} className="border-b border-steel-grey/10 hover:bg-navy/20 transition-colors">
                    <td className="py-2.5 pr-3">
                      <span className={clsx(
                        'w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold font-mono',
                        entry.rank === 1 ? 'bg-accent/20 text-accent' :
                        entry.rank === 2 ? 'bg-info/20 text-info' :
                        entry.rank === 3 ? 'bg-warning/20 text-warning' :
                        'bg-navy/50 text-mist/60'
                      )}>{entry.rank}</span>
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-pearl">{entry.agent_name}</td>
                    <td className="py-2.5 pr-3 text-right font-mono">{entry.impact_score}</td>
                    <td className="py-2.5 pr-3 text-right font-mono">{pct1(entry.success_rate)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-success">{entry.time_saved_minutes}m</td>
                    <td className="py-2.5 text-right font-mono text-mist/70">{entry.total_decisions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-mist/60 py-2">Not enough data to rank agents</div>
        )}
      </SectionCard>

      {/* Section 6: Decision Explorer */}
      <SectionCard title="Decision Explorer" icon={<MagnifyingGlass className="w-4 h-4" />} status={statuses.explorer}>
        <div className="space-y-3">
          {/* Search + Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mist/40" />
              <input
                type="text" placeholder="Search by order ID, agent, outcome..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-navy/50 border border-steel-grey/30 rounded-lg text-pearl placeholder:text-mist/30 focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>
            <div className="flex items-center gap-1 bg-navy/40 rounded-lg p-0.5 border border-steel-grey/20">
              {['all', 'no_action', 'alert', 'reroute'].map(f => (
                <button key={f} onClick={() => setFilterType(f)}
                  className={clsx(
                    'px-2 py-1 text-[10px] uppercase tracking-wider rounded-md font-medium transition-colors',
                    filterType === f ? 'bg-accent text-white' : 'text-mist/50 hover:text-pearl'
                  )}>
                  {f === 'all' ? 'All' : f === 'no_action' ? 'No Action' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {filteredDecisions.length > 0 ? (
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto scrollbar-hide">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-abyss z-10">
                  <tr className="text-mist/50 uppercase tracking-wider border-b border-steel-grey/20">
                    <th className="text-left py-2 pr-2 font-medium">Time</th>
                    <th className="text-left py-2 pr-2 font-medium">Order</th>
                    <th className="text-left py-2 pr-2 font-medium">Agent</th>
                    <th className="text-left py-2 pr-2 font-medium">Decision</th>
                    <th className="text-right py-2 pr-2 font-medium">Risk</th>
                    <th className="text-right py-2 pr-2 font-medium">Latency</th>
                    <th className="text-right py-2 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDecisions.slice(0, 100).map(d => (
                    <tr key={d.id} className="border-b border-steel-grey/10 hover:bg-navy/20 transition-colors">
                      <td className="py-2 pr-2 text-mist/60 font-mono whitespace-nowrap">
                        {d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : '--'}
                      </td>
                      <td className="py-2 pr-2 font-mono text-mist/80 max-w-[100px] truncate">{d.order_id.slice(0, 8)}...</td>
                      <td className="py-2 pr-2 text-pearl whitespace-nowrap">{d.agent_type.replace(' Agent', '')}</td>
                      <td className="py-2 pr-2">
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium',
                          d.decision_type === 'alert' ? 'text-warning bg-warning/10' :
                          d.decision_type === 'reroute' ? 'text-info bg-info/10' :
                          'text-mist/60 bg-navy/40'
                        )}>{d.decision_type}</span>
                      </td>
                      <td className="py-2 pr-2 text-right font-mono">
                        <span className={d.risk_score > 0.5 ? 'text-critical' : d.risk_score > 0.3 ? 'text-warning' : 'text-mist/60'}>
                          {d.risk_score.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right font-mono text-mist/60">{fmtMs(d.latency_ms)}</td>
                      <td className="py-2 text-right">
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium',
                          d.outcome === 'prevented' || d.outcome === 'delivered_on_time' ? 'text-success bg-success/10' :
                          d.outcome === 'still_late' ? 'text-critical bg-critical/10' :
                          'text-mist/50 bg-navy/30'
                        )}>{d.outcome}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-xs text-mist/60 py-3 text-center">No decisions match your search</div>
          )}
          {data && data.decision_explorer.total > 100 && (
            <div className="text-[10px] text-mist/40 text-center">
              Showing 100 of {data.decision_explorer.total} decisions
            </div>
          )}
        </div>
      </SectionCard>

      {/* Section 7: Failure Analysis */}
      <SectionCard title="Failure Analysis" icon={<WarningCircle className="w-4 h-4" weight="fill" />} status={statuses.failures}>
        {failures ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <MetricTile label="Total Failures" value={failures.total_failures}
                  color={failures.total_failures > 0 ? 'text-critical' : 'text-success'} />
                <MetricTile label="Failure Rate" value={pct1(failures.failure_rate)}
                  color={failures.failure_rate > 0.1 ? 'text-critical' : 'text-success'} />
                <MetricTile label="Avg Retries" value={failures.avg_retries}
                  color={failures.avg_retries > 0 ? 'text-warning' : 'text-mist/50'} />
              </div>
              {failures.total_failures === 0 && (
                <div className="flex items-center gap-2 text-xs text-success">
                  <CheckCircle className="w-4 h-4" weight="fill" />
                  No failures recorded — all agents operating normally
                </div>
              )}
            </div>
            <div>
              {failures.reasons.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-mist/50 uppercase tracking-wider font-medium mb-1">Failure Reasons</div>
                  {failures.reasons.map(r => (
                    <div key={r.reason} className="flex items-center gap-2 text-xs bg-critical-bg/30 rounded-lg px-2.5 py-1.5 border border-critical-border/30">
                      <WarningCircle className="w-3 h-3 text-critical shrink-0" weight="fill" />
                      <span className="flex-1 text-mist/80 capitalize">{r.reason.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-critical">{r.count}</span>
                    </div>
                  ))}
                </div>
              ) : failures.total_failures > 0 ? null : null}
            </div>
          </div>
        ) : null}
      </SectionCard>
    </div>
  )
}

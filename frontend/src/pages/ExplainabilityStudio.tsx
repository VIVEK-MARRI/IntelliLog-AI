import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import clsx from 'clsx'
import {
  MagnifyingGlass, ArrowLeft, WarningCircle, CheckCircle, XCircle,
  Eye, GitFork, Graph, ChartBar, SealCheck, Clock, Robot,
  ArrowElbowRight, TrendDown,
} from '@phosphor-icons/react'
import { explainAPI } from '@/api/explain'
import type { ExplainResponse, ShapFactor } from '@/types/api'
import { DataFreshness, ConfidenceDisplay } from '@/components/trust'

// ─── Helpers ──────────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

// ─── Section shell ────────────────────────────────────────────────────────

const Section: React.FC<{
  number: string
  title: string
  icon: React.ReactNode
  loading?: boolean
  error?: string
  children: React.ReactNode
  className?: string
  freshness?: string
}> = ({ number, title, icon, loading, error, children, className, freshness }) => (
  <div className={clsx(
    'bg-abyss border border-steel-grey/30 rounded-xl overflow-hidden',
    className,
  )}>
    <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-steel-grey/20">
      <span className="flex items-center justify-center w-5 h-5 rounded bg-accent/10 text-accent text-[10px] font-bold font-mono">
        {number}
      </span>
      <span className="text-accent/70 text-xs">{icon}</span>
      <h3 className="text-xs font-semibold text-pearl tracking-wide uppercase">{title}</h3>
      <div className="ml-auto flex items-center gap-2">
        {freshness && <DataFreshness timestamp={freshness} compact maxAgeMs={60000} />}
        {loading && <span className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
      </div>
    </div>
    <div className="p-4">
      {error ? (
        <div className="flex items-center gap-2 text-xs text-critical">
          <XCircle className="w-4 h-4" weight="fill" />
          <span>{error}</span>
        </div>
      ) : (
        children
      )}
    </div>
  </div>
)

// ─── SHAP waterfall bar ───────────────────────────────────────────────────

const ShapBar: React.FC<{ factor: ShapFactor; maxAbs: number }> = ({ factor, maxAbs }) => {
  const isInc = factor.direction === 'increases'
  const widthPct = maxAbs > 0 ? (Math.abs(factor.shap_value) / maxAbs) * 100 : 0
  return (
    <div className="flex items-center gap-2 group">
      {/* Label */}
      <div className="w-28 md:w-36 shrink-0 text-right">
        <span className="text-[11px] text-mist/80 font-medium leading-tight block truncate" title={factor.label}>
          {factor.label}
        </span>
        <span className="text-[9px] text-mist/40 font-mono block truncate">{factor.feature}</span>
      </div>
      {/* Bar */}
      <div className="flex-1 h-5 relative">
        <div className="absolute inset-0 flex items-center">
          <div
            className={clsx(
              'h-3 rounded-sm transition-all duration-500',
              isInc ? 'bg-critical/70 ml-auto' : 'bg-success/70',
            )}
            style={{
              width: `${Math.max(widthPct, 2)}%`,
              marginLeft: isInc ? undefined : 0,
              marginRight: isInc ? 0 : undefined,
            }}
          />
        </div>
      </div>
      {/* Value */}
      <div className="w-16 shrink-0 text-right">
        <span className={clsx(
          'text-xs font-mono font-medium',
          isInc ? 'text-critical' : 'text-success',
        )}>
          {factor.shap_value > 0 ? '+' : ''}{factor.shap_value.toFixed(3)}
        </span>
      </div>
    </div>
  )
}

// ─── Feature importance row ───────────────────────────────────────────────

const ImportanceRow: React.FC<{ factor: ShapFactor; rank: number; maxContrib: number }> = ({
  factor, rank, maxContrib,
}) => {
  const isInc = factor.direction === 'increases'
  const widthPct = maxContrib > 0 ? (factor.contribution / maxContrib) * 100 : 0
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-navy/30 transition-colors">
      <span className="w-4 text-[10px] text-mist/40 font-mono text-right">{rank}</span>
      <div className="w-32 shrink-0">
        <span className="text-xs text-pearl/80">{factor.label}</span>
      </div>
      <div className="flex-1 h-2 bg-navy/50 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', isInc ? 'bg-critical' : 'bg-success')}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="w-14 text-right text-[11px] text-mist/60 font-mono">{factor.contribution.toFixed(3)}</span>
      <span className={clsx(
        'text-[10px] font-medium px-1.5 py-0.5 rounded',
        isInc ? 'text-critical bg-critical/10' : 'text-success bg-success/10',
      )}>
        {isInc ? '+risk' : '-risk'}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────

export const ExplainabilityStudio: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const [orderInput, setOrderInput] = useState(orderId || '')
  const [data, setData] = useState<ExplainResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchExplain = useCallback(async (oid: string) => {
    if (!oid) return
    setLoading(true)
    setError(null)
    try {
      const result = await explainAPI.getExplain(oid)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load explanation')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (orderId) {
      setOrderInput(orderId)
      fetchExplain(orderId)
    }
  }, [orderId, fetchExplain])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (orderInput.trim()) {
      navigate(`/explain/${orderInput.trim()}`, { replace: true })
      fetchExplain(orderInput.trim())
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (!data && !loading && !error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Eye className="w-7 h-7 text-accent" weight="fill" />
          </div>
          <h1 className="text-lg font-semibold text-pearl mb-2">Explainability Studio</h1>
          <p className="text-sm text-mist/70 mb-6 leading-relaxed">
            Understand why the AI made a prediction. Enter an order ID to inspect SHAP explanations,
            agent reasoning, and business impact.
          </p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={orderInput}
              onChange={e => setOrderInput(e.target.value)}
              placeholder="e.g. e9ed1520-47c8-4e9b-a6ba-..."
              className="flex-1 bg-navy border border-steel-grey/50 rounded-lg px-3 py-2.5 text-sm text-pearl placeholder:text-mist/40 font-mono focus:outline-none focus:border-accent/50 transition-colors"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-1.5"
            >
              <MagnifyingGlass size={14} />
              Inspect
            </button>
          </form>
          <div className="mt-4 text-[10px] text-mist/30">
            <Link to="/orders" className="text-accent/50 hover:text-accent underline underline-offset-2">Browse orders</Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="h-full flex flex-col gap-3 p-4 overflow-y-auto scrollbar-hide">
        <div className="flex items-center gap-3 mb-1">
          <Eye className="w-5 h-5 text-accent" weight="fill" />
          <h1 className="text-lg font-semibold text-pearl">Explainability Studio</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-abyss border border-steel-grey/30 rounded-xl p-4 animate-pulse">
              <div className="h-3 w-20 bg-navy rounded mb-3" />
              <div className="space-y-2">
                <div className="h-2.5 bg-navy rounded w-full" />
                <div className="h-2.5 bg-navy rounded w-3/4" />
                <div className="h-2.5 bg-navy rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="bg-critical-bg border border-critical-border rounded-xl p-6 max-w-md text-center">
          <XCircle className="w-10 h-10 text-critical mx-auto mb-3" weight="fill" />
          <h3 className="text-sm font-semibold text-pearl mb-1">Unable to load explanation</h3>
          <p className="text-xs text-mist/70 mb-4">{error}</p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={orderInput}
              onChange={e => setOrderInput(e.target.value)}
              placeholder="Try another order ID"
              className="flex-1 bg-navy border border-steel-grey/50 rounded-lg px-3 py-2 text-xs text-pearl placeholder:text-mist/40 font-mono focus:outline-none focus:border-accent/50"
            />
            <button type="submit" className="px-3 py-2 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors">
              Inspect
            </button>
          </form>
        </div>
      </div>
    )
  }

  const os = data!.order_summary
  const shap = data!.shap_factors
  const fi = data!.feature_importance
  const narrative = data!.risk_narrative
  const agent = data!.agent_decision
  const impact = data!.impact_analysis
  const maxShap = Math.max(...shap.map(f => Math.abs(f.shap_value)), 0.001)
  const maxContrib = Math.max(...fi.map(f => f.contribution), 0.001)

  return (
    <div className="h-full flex flex-col gap-3 p-4 overflow-y-auto scrollbar-hide">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-mist hover:text-pearl hover:bg-navy/50 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <Eye className="w-5 h-5 text-accent" weight="fill" />
          <h1 className="text-lg font-semibold text-pearl">Explainability Studio</h1>
          <span className="text-[10px] font-mono text-mist/40 truncate max-w-[160px]">{os.order_id.slice(0, 8)}…</span>
        </div>
        <form onSubmit={handleSearch} className="flex gap-1.5">
          <input
            type="text"
            value={orderInput}
            onChange={e => setOrderInput(e.target.value)}
            placeholder="Order ID"
            className="w-44 bg-navy border border-steel-grey/30 rounded-lg px-2.5 py-1.5 text-[11px] text-pearl placeholder:text-mist/30 font-mono focus:outline-none focus:border-accent/40"
          />
          <button
            type="submit"
            className="px-2.5 py-1.5 bg-accent/10 text-accent text-[11px] font-medium rounded-lg hover:bg-accent/20 transition-colors"
          >
            <MagnifyingGlass size={13} />
          </button>
        </form>
      </div>

      {/* Row 1: Order Summary + Impact Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* ─── Section 1: Order Summary ───────────────────────────────────── */}
        <Section number="1" title="Order Summary" icon={<SealCheck className="w-3.5 h-3.5" />} freshness={data?.generated_at}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-steel-grey/20">
              <ConfidenceDisplay value={parseFloat(os.confidence) || 0} size="sm" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-mist/50 uppercase tracking-wider font-medium">Order ID</span>
              <span className="text-xs font-mono text-pearl/80">{os.order_id.slice(0, 12)}…</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-mist/50 uppercase tracking-wider font-medium">Driver</span>
              <span className="text-xs text-pearl/80">{os.driver_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-mist/50 uppercase tracking-wider font-medium">ETA</span>
              <span className="text-xs text-pearl/80 font-mono">
                {os.planned_eta ? new Date(os.planned_eta).toLocaleTimeString() : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-mist/50 uppercase tracking-wider font-medium">Status</span>
              <span className={clsx(
                'text-xs font-medium px-2 py-0.5 rounded',
                os.status === 'active' ? 'text-success bg-success-bg' : 'text-mist bg-navy/50',
              )}>{os.status}</span>
            </div>
            <div className="pt-1 border-t border-steel-grey/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-mist/50 uppercase tracking-wider font-medium">Risk Score</span>
                <span className={clsx(
                  'text-sm font-bold font-mono',
                  os.is_high_risk ? 'text-critical' : os.risk_score > 0.3 ? 'text-warning' : 'text-success',
                )}>{pct(os.risk_score)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-mist/50 uppercase tracking-wider font-medium">Confidence</span>
                <span className="text-xs font-mono text-pearl/80">{os.confidence}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-mist/50 uppercase tracking-wider font-medium">Delay</span>
                <span className="text-xs font-mono text-warning">{os.predicted_delay_minutes} min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-mist/50 uppercase tracking-wider font-medium">Stops</span>
                <span className="text-xs font-mono text-pearl/80">{os.stops_remaining} remaining</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ─── Section 6: Impact Analysis ─────────────────────────────────── */}
        <Section number="6" title="Business Impact" icon={<TrendDown className="w-3.5 h-3.5" />} freshness={data?.generated_at}>
          {impact.has_intervention ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-navy/40 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-mist/50 uppercase tracking-wider mb-0.5">Previous Risk</div>
                  <div className={clsx(
                    'text-sm font-bold font-mono',
                    (impact.previous_risk_score ?? 1) > 0.7 ? 'text-critical' : 'text-warning',
                  )}>{pct(impact.previous_risk_score ?? 0)}</div>
                </div>
                <div className="bg-navy/40 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-mist/50 uppercase tracking-wider mb-0.5">Current Risk</div>
                  <div className={clsx(
                    'text-sm font-bold font-mono',
                    impact.current_risk_score > 0.7 ? 'text-critical' : impact.current_risk_score > 0.3 ? 'text-warning' : 'text-success',
                  )}>{pct(impact.current_risk_score)}</div>
                </div>
              </div>
              {impact.risk_reduction !== null && (
                <div className="bg-success-bg border border-success-border rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-success/70 uppercase tracking-wider mb-0.5">Risk Reduction</div>
                  <div className="text-base font-bold font-mono text-success">
                    -{pct(impact.risk_reduction)}
                  </div>
                </div>
              )}
              {impact.time_saved_minutes !== null && (
                <div className="bg-accent/10 border border-accent/20 rounded-lg p-2.5 text-center">
                  <div className="text-[10px] text-accent/70 uppercase tracking-wider mb-0.5">Time Saved</div>
                  <div className="text-base font-bold font-mono text-accent">
                    {impact.time_saved_minutes} min
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-mist/50 py-2">
              <Clock className="w-4 h-4" />
              No agent intervention recorded for this order
            </div>
          )}
        </Section>

        {/* ─── Section 4: Risk Narrative ──────────────────────────────────── */}
        <Section number="4" title="Risk Narrative" icon={<Graph className="w-3.5 h-3.5" />} freshness={data?.generated_at}>
          <div className="flex items-center justify-between mb-2">
            <ConfidenceDisplay value={parseFloat(os.confidence) || 0} size="sm" label="Prediction confidence" />
          </div>
          <div className="flex items-start gap-2.5">
            <div className={clsx(
              'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
              os.is_high_risk ? 'bg-critical/10' : 'bg-success/10',
            )}>
              {os.is_high_risk
                ? <WarningCircle className="w-3.5 h-3.5 text-critical" weight="fill" />
                : <CheckCircle className="w-3.5 h-3.5 text-success" weight="fill" />
              }
            </div>
            <p className="text-xs text-pearl/70 leading-relaxed">{narrative}</p>
          </div>
        </Section>
      </div>

      {/* Row 2: SHAP Waterfall + Feature Importance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* ─── Section 2: SHAP Waterfall ──────────────────────────────────── */}
        <Section
          number="2"
          title="SHAP Waterfall"
          icon={<ArrowElbowRight className="w-3.5 h-3.5" />}
          className="lg:col-span-2"
          loading={loading && !data}
          freshness={data?.generated_at ? data.generated_at : undefined}
        >
          {shap.length === 0 ? (
            <div className="text-xs text-mist/50 py-2">No SHAP factors available for this prediction.</div>
          ) : (
            <div className="space-y-2">
              {/* Legend */}
              <div className="flex items-center gap-3 mb-2 text-[10px] text-mist/50">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-critical/70 inline-block" /> Increases risk</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success/70 inline-block" /> Decreases risk</span>
              </div>
              {/* Baseline */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-28 md:w-36 shrink-0 text-right" />
                <div className="flex-1">
                  <div className="h-px bg-mist/20" />
                </div>
                <div className="w-16 shrink-0 text-right text-[10px] text-mist/40 font-mono">
                  E[f(x)] = {os.risk_score.toFixed(2)}
                </div>
              </div>
              {/* Bars sorted: most positive (risk-increasing) at top */}
              {[...shap]
                .sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))
                .map((factor) => (
                  <ShapBar key={factor.feature} factor={factor} maxAbs={maxShap} />
                ))}
              {/* Final score */}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-steel-grey/20">
                <div className="w-28 md:w-36 shrink-0 text-right">
                  <span className="text-[11px] font-semibold text-pearl">Predicted Risk</span>
                </div>
                <div className="flex-1">
                  <div className={clsx(
                    'h-4 rounded-sm',
                    os.is_high_risk ? 'bg-critical/30' : os.risk_score > 0.3 ? 'bg-warning/30' : 'bg-success/30',
                  )} />
                </div>
                <div className="w-16 shrink-0 text-right">
                  <span className={clsx(
                    'text-sm font-bold font-mono',
                    os.is_high_risk ? 'text-critical' : os.risk_score > 0.3 ? 'text-warning' : 'text-success',
                  )}>{pct(os.risk_score)}</span>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* ─── Section 3: Feature Importance ──────────────────────────────── */}
        <Section number="3" title="Feature Importance" icon={<ChartBar className="w-3.5 h-3.5" />} freshness={data?.generated_at}>
          {fi.length === 0 ? (
            <div className="text-xs text-mist/50 py-2">No feature importance data.</div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center gap-3 mb-2 pb-1 border-b border-steel-grey/20 text-[9px] text-mist/40 uppercase tracking-wider font-medium">
                <span className="w-4 text-center">#</span>
                <span className="w-32">Feature</span>
                <span className="flex-1">Contribution</span>
                <span className="w-14 text-right">Value</span>
                <span className="w-12 text-right">Dir</span>
              </div>
              {fi.map((factor, i) => (
                <ImportanceRow key={factor.feature} factor={factor} rank={i + 1} maxContrib={maxContrib} />
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Row 3: Agent Reasoning */}
      <div className="grid grid-cols-1 gap-3">
        <Section number="5" title="Agent Reasoning" icon={<Robot className="w-3.5 h-3.5" />} freshness={data?.generated_at}>
          {!agent.has_decisions ? (
            <div className="flex items-center gap-2 text-xs text-mist/50 py-2">
              <Clock className="w-4 h-4" />
              No agent decisions recorded for this order.
            </div>
          ) : (
            <div className="space-y-3">
              {agent.decisions.slice(0, 5).map((dec) => (
                <div key={dec.decision_id} className="bg-navy/30 rounded-lg border border-steel-grey/20 p-3">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        dec.decision_type === 'reroute' ? 'text-warning bg-warning-bg' :
                        dec.decision_type === 'alert' ? 'text-accent bg-accent/10' :
                        'text-mist/50 bg-navy/50',
                      )}>{dec.decision_type}</span>
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        dec.outcome === 'success' ? 'text-success bg-success-bg' :
                        dec.outcome === 'failed' ? 'text-critical bg-critical-bg' :
                        'text-warning bg-warning-bg',
                      )}>{dec.outcome}</span>
                    </div>
                    <div className="text-[10px] text-mist/40 font-mono">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {dec.timestamp ? new Date(dec.timestamp).toLocaleTimeString() : '--'}
                      <span className="ml-2">{fmtMs(dec.latency_ms)}</span>
                    </div>
                  </div>
                  {/* Reasoning */}
                  <p className="text-[11px] text-pearl/60 leading-relaxed mb-2">{dec.reasoning}</p>
                  {/* SHAP factors inline */}
                  {dec.shap_factors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {dec.shap_factors.map((sf) => (
                        <span key={sf.feature} className={clsx(
                          'text-[9px] px-1.5 py-0.5 rounded font-mono',
                          (sf.direction === 'increases' || sf.direction as string === 'increases_risk')
                            ? 'text-critical bg-critical/10' : 'text-success bg-success/10',
                        )}>
                          {sf.feature} {sf.contribution > 0 ? '+' : ''}{sf.contribution.toFixed(3)}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Tools */}
                  {dec.tools_invoked.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-mist/40">
                      <GitFork className="w-3 h-3" />
                      {dec.tools_invoked.map(t => (
                        <span key={t} className="bg-navy/50 px-1.5 py-0.5 rounded text-[9px] font-mono">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

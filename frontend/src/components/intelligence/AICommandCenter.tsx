import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useHighRiskOrders } from '@/store/fleetStore'
import { predictionsAPI } from '@/api/predictions'
import { agentAPI, AgentDecisionResponse } from '@/api/agent'
import { copilotAPI } from '@/api/copilot'
import { wsManager, WS_EVENTS } from '@/api/websocket'
import { PredictionResponse, RiskFactor } from '@/types/api'
import { CopilotResponse } from '@/types/copilot'
import { Shield, TrendingUp, TrendingDown, Brain, Sparkles, Clock, Gauge, AlertTriangle, Activity } from 'lucide-react'
import clsx from 'clsx'

interface OrderIntelligence {
  orderId: string
  prediction: PredictionResponse
  latestDecision: AgentDecisionResponse | null
  delayMinutes: number
  etaImpact: number
}

const formatOrderId = (id: string) => id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase()

export const AICommandCenter: React.FC = () => {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const highRiskOrders = useHighRiskOrders()
  const orderIds = highRiskOrders.map((o) => o.id)
  const [intelMap, setIntelMap] = useState<Map<string, OrderIntelligence>>(new Map())
  const [loadingPredictions, setLoadingPredictions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const recommendationQuery = useQuery({
    queryKey: ['copilot', 'recommendations'],
    queryFn: () => copilotAPI.getRecommendations(),
    staleTime: 60000,
    retry: 1,
  })

  const fetchIntel = useCallback(async () => {
    if (orderIds.length === 0) return
    setLoadingPredictions(true)
    setError(null)

    try {
      const batchPromise = predictionsAPI.getBatchPredictions(orderIds)
        .catch(() => {
          const map: Record<string, PredictionResponse> = {}
          return map
        })

      const decisionsPromise = orderIds.length <= 5
        ? Promise.all(
            orderIds.map((id) =>
              agentAPI.getOrderDecisions(id)
                .then((r) => ({ orderId: id, decisions: r }))
                .catch(() => ({ orderId: id, decisions: null }))
            )
          )
        : Promise.resolve([])

      const [batchResults, decisionsResults] = await Promise.all([batchPromise, decisionsPromise])

      if (!mountedRef.current) return

      const newIntel: Map<string, OrderIntelligence> = new Map()

      for (const order of highRiskOrders) {
        const prediction = batchResults[order.id]
        if (!prediction) continue

        const decisionResult = decisionsResults.find((d) => d.orderId === order.id)
        const latestDecision = decisionResult?.decisions?.latestDecision ?? null

        const plannedEta = order.planned_eta ? new Date(order.planned_eta).getTime() : 0
        const currentEta = order.current_eta ? new Date(order.current_eta).getTime() : 0
        const etaImpact = plannedEta && currentEta ? Math.round((currentEta - plannedEta) / 60000) : 0

        newIntel.set(order.id, {
          orderId: order.id,
          prediction,
          latestDecision,
          delayMinutes: order.delay_minutes,
          etaImpact,
        })
      }

      setIntelMap(newIntel)
      if (!selectedOrderId || !newIntel.has(selectedOrderId)) {
        setSelectedOrderId(newIntel.keys().next().value ?? null)
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load intelligence data')
      }
    } finally {
      if (mountedRef.current) setLoadingPredictions(false)
    }
  }, [orderIds, highRiskOrders, selectedOrderId])

  useEffect(() => {
    fetchIntel()
  }, [fetchIntel])

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const unsubPrediction = wsManager.on(WS_EVENTS.PREDICTION_UPDATED, (msg) => {
      const orderId = msg.data?.order_id
      if (orderId && intelMap.has(orderId)) {
        const existing = intelMap.get(orderId)!
        setIntelMap((prev) => {
          const next = new Map(prev)
          next.set(orderId, {
            ...existing,
            prediction: { ...existing.prediction, risk_score: msg.data.risk_score },
          })
          return next
        })
      }
    })

    const unsubDecision = wsManager.on(WS_EVENTS.AGENT_DECISION, (msg) => {
      const data = msg.data as Record<string, any>
      if (data?.order_id) {
        agentAPI.getOrderDecisions(data.order_id).then((r) => {
          if (!mountedRef.current) return
          setIntelMap((prev) => {
            const next = new Map(prev)
            const existing = next.get(data.order_id)
            if (existing) {
              next.set(data.order_id, { ...existing, latestDecision: r.latestDecision ?? existing.latestDecision })
            }
            return next
          })
        }).catch(() => {})
      }
    })

    return () => {
      unsubPrediction()
      unsubDecision()
    }
  }, [intelMap])

  const selectedIntel = selectedOrderId ? intelMap.get(selectedOrderId) : null
  const copilotData = recommendationQuery.data

  if (orderIds.length === 0 && !loadingPredictions) {
    return (
      <div className="bg-abyss border border-steel-grey/30 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-6 h-6 text-accent" />
          <h2 className="text-xl font-bold text-pearl">AI Operations Command Center</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="w-12 h-12 text-mist/40 mb-4" />
          <p className="text-mist font-medium">No high-risk orders detected</p>
          <p className="text-sm text-mist/60 mt-1">All deliveries are operating within normal parameters</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-abyss border border-steel-grey/30 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-steel-grey/30 bg-obsidian/50">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-accent" />
          <div>
            <h2 className="text-lg font-bold text-pearl">AI Operations Command Center</h2>
            <p className="text-xs text-mist">Live AI decision pipeline — {orderIds.length} high-risk order{orderIds.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {recommendationQuery.isLoading && (
            <span className="text-xs text-mist flex items-center gap-1">
              <Sparkles className="w-3 h-3 animate-pulse" />
              Generating insights...
            </span>
          )}
          {recommendationQuery.data && (
            <span className={clsx(
              'text-xs font-medium px-2 py-1 rounded',
              recommendationQuery.data.confidence > 0.8
                ? 'text-success bg-success-bg border border-success-border'
                : 'text-warning bg-warning-bg border border-warning-border'
            )}>
              {(recommendationQuery.data.confidence * 100).toFixed(0)}% confidence
            </span>
          )}
        </div>
      </div>

      <div className="flex h-[520px]">
        <div className="w-64 border-r border-steel-grey/30 overflow-y-auto flex-shrink-0">
          <div className="p-2 space-y-1">
            {highRiskOrders.map((order) => {
              const intel = intelMap.get(order.id)
              const isSelected = selectedOrderId === order.id
              const score = intel?.prediction.risk_score ?? order.risk_score
              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150',
                    isSelected
                      ? 'bg-accent/10 border border-accent/30'
                      : 'hover:bg-navy border border-transparent'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={clsx(
                      'text-sm font-mono font-medium',
                      isSelected ? 'text-accent' : 'text-cloud'
                    )}>
                      {formatOrderId(order.id)}
                    </span>
                    <span className={clsx(
                      'status-dot',
                      score > 0.8 ? 'status-dot--critical' : 'status-dot--warning'
                    )} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={clsx(
                      'text-lg font-bold font-mono',
                      score > 0.8 ? 'text-critical' : 'text-warning'
                    )}>
                      {(score * 100).toFixed(0)}%
                    </span>
                    {intel?.latestDecision && (
                      <span className={clsx(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded',
                        intel.latestDecision.decisionType === 'reroute' && 'bg-accent/20 text-accent',
                        intel.latestDecision.decisionType === 'alert' && 'bg-warning-bg text-warning',
                        intel.latestDecision.decisionType === 'no_action' && 'bg-steel-grey/30 text-mist'
                      )}>
                        {intel.latestDecision.decisionType === 'reroute' ? 'REROUTE'
                          : intel.latestDecision.decisionType === 'alert' ? 'ALERT'
                          : 'MONITOR'}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingPredictions && !selectedIntel ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16 rounded-lg" />
              ))}
              <div className="skeleton h-32 rounded-lg mt-6" />
              <div className="skeleton h-24 rounded-lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <AlertTriangle className="w-10 h-10 text-critical mb-3" />
              <p className="text-critical font-medium">Failed to load intelligence data</p>
              <p className="text-sm text-mist/60 mt-1">{error}</p>
              <button onClick={fetchIntel} className="btn btn--secondary btn--sm mt-4">
                Retry
              </button>
            </div>
          ) : selectedIntel ? (
            <PipelineDetail intel={selectedIntel} copilot={copilotData ?? null} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-mist/60">Select an order to view intelligence</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface PipelineDetailProps {
  intel: OrderIntelligence
  copilot: CopilotResponse | null
}

const PipelineDetail: React.FC<PipelineDetailProps> = ({ intel, copilot }) => {
  const { prediction, latestDecision, etaImpact } = intel
  const riskPct = (prediction.risk_score * 100).toFixed(0)
  const confidencePct = (prediction.confidence * 100).toFixed(0)

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-6">
        <div>
          <p className="text-xs text-mist font-medium mb-1">Risk Score</p>
          <div className="flex items-baseline gap-2">
            <span className={clsx(
              'text-3xl font-bold font-mono',
              prediction.risk_score > 0.8 ? 'text-critical' : 'text-warning'
            )}>
              {riskPct}%
            </span>
            {prediction.predicted_delay_minutes > 0 && (
              <span className="text-xs text-critical/80 font-medium">
                +{prediction.predicted_delay_minutes.toFixed(0)}min delay
              </span>
            )}
          </div>
        </div>

        <div className="w-px h-12 bg-steel-grey/30" />

        <div>
          <p className="text-xs text-mist font-medium mb-1">Confidence</p>
          <div className="flex items-center gap-2">
            <Gauge className={clsx(
              'w-4 h-4',
              prediction.confidence > 0.85 ? 'text-success' : prediction.confidence > 0.7 ? 'text-warning' : 'text-critical'
            )} />
            <span className="text-lg font-bold font-mono text-pearl">{confidencePct}%</span>
          </div>
        </div>

        <div className="w-px h-12 bg-steel-grey/30" />

        <div>
          <p className="text-xs text-mist font-medium mb-1">ETA Impact</p>
          <div className="flex items-center gap-2">
            <Clock className={clsx('w-4 h-4', etaImpact > 0 ? 'text-critical' : 'text-success')} />
            <span className={clsx(
              'text-lg font-bold font-mono',
              etaImpact > 0 ? 'text-critical' : 'text-success'
            )}>
              {etaImpact > 0 ? `+${etaImpact}` : etaImpact}m
            </span>
          </div>
        </div>

        {latestDecision?.impact?.time_saved_minutes ? (
          <>
            <div className="w-px h-12 bg-steel-grey/30" />
            <div>
              <p className="text-xs text-mist font-medium mb-1">Time Saved</p>
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-success" />
                <span className="text-lg font-bold font-mono text-success">
                  {latestDecision.impact.time_saved_minutes.toFixed(0)}m
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-4">
          <PanelSection title="Top Risk Drivers" icon={<TrendingUp className="w-4 h-4 text-warning" />}>
            {prediction.topRiskFactors.length > 0 ? (
              <div className="space-y-2.5">
                {prediction.topRiskFactors.slice(0, 4).map((factor, idx) => (
                  <RiskFactorRow key={`${factor.feature}-${idx}`} factor={factor} />
                ))}
              </div>
            ) : latestDecision && latestDecision.topRiskFactors.length > 0 ? (
              <div className="space-y-2.5">
                {latestDecision.topRiskFactors.slice(0, 4).map((factor, idx) => (
                  <RiskFactorRow key={`${factor.feature}-${idx}`} factor={factor} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-mist/60">No SHAP data available</p>
            )}
          </PanelSection>

          <PanelSection title="Agent Decision" icon={<Brain className="w-4 h-4 text-accent" />}>
            {latestDecision ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    'px-2 py-0.5 rounded text-xs font-semibold',
                    latestDecision.decisionType === 'reroute' && 'bg-accent/20 text-accent',
                    latestDecision.decisionType === 'alert' && 'bg-warning-bg text-warning',
                    latestDecision.decisionType === 'no_action' && 'bg-steel-grey/30 text-mist'
                  )}>
                    {latestDecision.decisionType.toUpperCase()}
                  </span>
                  <span className="text-xs text-mist/60">
                    {latestDecision.latencyMs}ms · {latestDecision.outcome}
                  </span>
                </div>
                <p className="text-sm text-cloud leading-relaxed">{latestDecision.reasoning}</p>
                {latestDecision.toolsInvoked.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {latestDecision.toolsInvoked.map((tool) => (
                      <span key={tool} className="text-[10px] font-mono text-mist bg-navy px-1.5 py-0.5 rounded border border-steel-grey/30">
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
                {latestDecision.impact?.risk_reduction && (
                  <p className="text-xs text-success">
                    Risk reduction: {(latestDecision.impact.risk_reduction * 100).toFixed(0)}%
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-mist/60">No agent decision recorded yet</p>
            )}
          </PanelSection>
        </div>

        <div className="space-y-4">
          <PanelSection title="Recommendation" icon={<Sparkles className="w-4 h-4 text-accent-light" />}>
            {copilot ? (
              <div className="space-y-3">
                <p className="text-sm text-cloud leading-relaxed">{copilot.summary || 'No summary available'}</p>
                {copilot.recommendations.length > 0 && (
                  <ul className="space-y-1.5">
                    {copilot.recommendations.slice(0, 3).map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-pearl">
                        <span className="text-accent mt-1 flex-shrink-0">→</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs text-mist/60">No recommendations available</p>
            )}
          </PanelSection>

          <PanelSection title="Pipeline Timeline" icon={<Activity className="w-4 h-4 text-teal" />}>
            <PipelineTimeline intel={intel} copilot={copilot} />
          </PanelSection>
        </div>
      </div>
    </div>
  )
}

interface PanelSectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}

const PanelSection: React.FC<PanelSectionProps> = ({ title, icon, children }) => (
  <div className="bg-navy/50 border border-steel-grey/20 rounded-lg p-4">
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h3 className="text-xs font-semibold text-mist uppercase tracking-wider">{title}</h3>
    </div>
    {children}
  </div>
)

const RiskFactorRow: React.FC<{ factor: RiskFactor }> = ({ factor }) => {
  const pct = Math.min(Math.abs(factor.contribution) * 100, 100)
  const isUp = factor.direction === 'increases'

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium text-cloud truncate">{factor.humanReadable || factor.feature}</span>
          <span className={clsx('text-xs font-mono font-semibold', isUp ? 'text-critical' : 'text-success')}>
            {isUp ? '+' : '-'}{pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-navy rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-500', isUp ? 'bg-critical/60' : 'bg-success/60')}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

interface PipelineTimelineProps {
  intel: OrderIntelligence
  copilot: CopilotResponse | null
}

const PipelineTimeline: React.FC<PipelineTimelineProps> = ({ intel, copilot }) => {
  const stages = [
    {
      label: 'Risk Prediction',
      icon: <Gauge className="w-3.5 h-3.5" />,
      status: 'complete' as const,
      detail: `${(intel.prediction.risk_score * 100).toFixed(0)}% · ${(intel.prediction.confidence * 100).toFixed(0)}% conf`,
    },
    {
      label: 'SHAP Explain',
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      status: (intel.prediction.topRiskFactors.length > 0 || (intel.latestDecision?.topRiskFactors.length ?? 0) > 0) ? 'complete' as const : 'pending' as const,
      detail: intel.prediction.topRiskFactors.length > 0
        ? `${intel.prediction.topRiskFactors.length} factors`
        : intel.latestDecision?.topRiskFactors.length
        ? `${intel.latestDecision.topRiskFactors.length} factors`
        : 'No SHAP data',
    },
    {
      label: 'Agent Decision',
      icon: <Brain className="w-3.5 h-3.5" />,
      status: intel.latestDecision ? 'complete' as const : 'pending' as const,
      detail: intel.latestDecision
        ? `${intel.latestDecision.decisionType} · ${intel.latestDecision.latencyMs}ms`
        : 'Waiting...',
    },
    {
      label: 'Recommendation',
      icon: <Sparkles className="w-3.5 h-3.5" />,
      status: copilot && copilot.recommendations.length > 0 ? 'complete' as const : 'pending' as const,
      detail: copilot?.recommendations.length
        ? `${copilot.recommendations.length} actions`
        : 'Generating...',
    },
    {
      label: 'Business Impact',
      icon: <Clock className="w-3.5 h-3.5" />,
      status: intel.latestDecision?.impact?.time_saved_minutes ? 'complete' as const : 'pending' as const,
      detail: intel.latestDecision?.impact?.time_saved_minutes
        ? `${intel.latestDecision.impact.time_saved_minutes.toFixed(0)}m saved`
        : intel.etaImpact > 0
        ? `${intel.etaImpact}m delay impact`
        : 'Monitoring...',
    },
  ]

  return (
    <div className="space-y-3">
      {stages.map((stage, idx) => (
        <div key={stage.label} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={clsx(
              'w-7 h-7 rounded-full flex items-center justify-center',
              stage.status === 'complete'
                ? 'bg-accent/15 text-accent'
                : 'bg-navy text-mist/40 border border-steel-grey/30'
            )}>
              {stage.icon}
            </div>
            {idx < stages.length - 1 && (
              <div className={clsx(
                'w-px h-6',
                stage.status === 'complete' && stages[idx + 1].status === 'complete'
                  ? 'bg-accent/30'
                  : 'bg-steel-grey/20'
              )} />
            )}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center justify-between">
              <span className={clsx(
                'text-xs font-medium',
                stage.status === 'complete' ? 'text-cloud' : 'text-mist/50'
              )}>
                {stage.label}
              </span>
              <span className={clsx(
                'text-[10px] font-mono',
                stage.status === 'complete' ? 'text-mist' : 'text-mist/30'
              )}>
                {stage.detail}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

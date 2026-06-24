import React, { useState } from 'react'
import clsx from 'clsx'
import {
  SealCheck, SealWarning, WarningCircle, ArrowRight,
  CaretDown, CaretRight, Clock, Eye, MapPin, Bell,
  FileText, Robot, CheckCircle, XCircle, ArrowUpRight,
} from '@phosphor-icons/react'
import type {
  WorkspaceResponse as WorkspaceResponseType,
  WorkspaceSupportingOrder,
  WorkspaceSupportingPrediction,
  WorkspaceSupportingDecision,
  WorkspaceRecommendedAction,
} from '@/types/copilot'

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`
}

function trustLevel(confidence: number): { label: string; color: string; icon: React.ReactNode } {
  if (confidence >= 0.8) return { label: 'High Confidence', color: 'text-success', icon: <SealCheck className="w-3.5 h-3.5" weight="fill" /> }
  if (confidence >= 0.5) return { label: 'Medium Confidence', color: 'text-amber', icon: <SealWarning className="w-3.5 h-3.5" weight="fill" /> }
  return { label: 'Low Confidence', color: 'text-danger', icon: <WarningCircle className="w-3.5 h-3.5" weight="fill" /> }
}

function sourceIcon(src: string): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    orders: <MapPin className="w-3 h-3" />,
    predictions: <Eye className="w-3 h-3" />,
    drivers: <Robot className="w-3 h-3" />,
    gps_events: <MapPin className="w-3 h-3" />,
    llm: <Robot className="w-3 h-3" />,
    telemetry: <Clock className="w-3 h-3" />,
  }
  return iconMap[src] ?? <Clock className="w-3 h-3" />
}

const CollapsibleSection: React.FC<{
  title: string
  icon: React.ReactNode
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}> = ({ title, icon, count, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-slate/20 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-graphite hover:bg-slate/20 transition-colors text-left"
      >
        <span className="text-amber/70">{icon}</span>
        <span className="text-xs font-semibold text-silver uppercase tracking-wider">{title}</span>
        {count !== undefined && (
          <span className="text-xs font-mono text-silver-muted/60 ml-auto">{count}</span>
        )}
        <span className="text-silver-muted/40 ml-1">
          {open ? <CaretDown className="w-3 h-3" weight="fill" /> : <CaretRight className="w-3 h-3" weight="fill" />}
        </span>
      </button>
      {open && <div className="divide-y divide-slate/10">{children}</div>}
    </div>
  )
}

const ActionButton: React.FC<{
  action: WorkspaceRecommendedAction
  onAction: (action: WorkspaceRecommendedAction) => void
}> = ({ action, onAction }) => {
  const iconMap: Record<string, React.ReactNode> = {
    open_order: <ArrowUpRight className="w-3.5 h-3.5" weight="bold" />,
    explain: <Eye className="w-3.5 h-3.5" weight="bold" />,
    view_route: <MapPin className="w-3.5 h-3.5" weight="bold" />,
    create_alert: <Bell className="w-3.5 h-3.5" weight="bold" />,
    generate_report: <FileText className="w-3.5 h-3.5" weight="bold" />,
  }
  const priorityBorder = action.priority === 'critical' ? 'border-danger/40 hover:border-danger/60'
    : action.priority === 'high' ? 'border-amber/30 hover:border-amber/50'
    : 'border-slate/30 hover:border-amber/30'
  const priorityIcon = action.priority === 'critical' ? 'text-danger'
    : action.priority === 'high' ? 'text-amber'
    : 'text-amber'

  return (
    <button
      onClick={() => onAction(action)}
      className={clsx(
        'flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-charcoal/50',
        'hover:bg-charcoal transition-all duration-150 text-left group',
        priorityBorder,
      )}
    >
      <span className={clsx('shrink-0', priorityIcon)}>{iconMap[action.type]}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-silver group-hover:text-silver transition-colors truncate">
          {action.label}
        </div>
        {action.description && (
          <div className="text-[10px] text-silver-muted/60 truncate">{action.description}</div>
        )}
      </div>
      <ArrowRight className="w-3 h-3 text-silver-muted/30 group-hover:text-amber/60 transition-colors shrink-0" weight="bold" />
    </button>
  )
}

const OrderCard: React.FC<{
  order: WorkspaceSupportingOrder
  onAction: (action: WorkspaceRecommendedAction) => void
}> = ({ order, onAction }) => (
  <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-charcoal/30 transition-colors">
    <div className={clsx(
      'w-2 h-2 rounded-full shrink-0',
      order.risk_score >= 0.7 ? 'bg-danger' : order.risk_score >= 0.5 ? 'bg-amber' : 'bg-success',
    )} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-silver/80 font-medium truncate">
          {order.order_id.slice(0, 10)}...
        </span>
        <span className={clsx(
          'text-[10px] px-1 py-0.5 rounded font-medium',
          order.status === 'active' ? 'text-success bg-success/20' :
          order.status === 'delayed' ? 'text-amber bg-amber/20' :
          'text-silver-muted/50 bg-charcoal',
        )}>{order.status}</span>
      </div>
      <div className="text-[11px] text-silver-muted/60 mt-0.5">
        Driver: {order.driver_name} · Delay: {order.delay_minutes.toFixed(0)}m
      </div>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => onAction({ id: `open_order_${order.order_id}`, type: 'open_order', label: 'View', params: { order_id: order.order_id }, priority: 'normal' })}
        className="p-1.5 rounded text-silver-muted/40 hover:text-amber hover:bg-charcoal/50 transition-colors"
        title="Open Order"
      >
        <ArrowUpRight className="w-3 h-3" weight="bold" />
      </button>
      <button
        onClick={() => onAction({ id: `explain_${order.order_id}`, type: 'explain', label: 'Explain', params: { order_id: order.order_id }, priority: 'normal' })}
        className="p-1.5 rounded text-silver-muted/40 hover:text-amber hover:bg-charcoal/50 transition-colors"
        title="Explain"
      >
        <Eye className="w-3 h-3" weight="bold" />
      </button>
    </div>
  </div>
)

const PredictionCard: React.FC<{
  prediction: WorkspaceSupportingPrediction
}> = ({ prediction }) => (
  <div className="px-3 py-2.5 hover:bg-charcoal/30 transition-colors">
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[11px] font-mono text-silver-muted/60">{prediction.order_id.slice(0, 10)}...</span>
      <span className={clsx(
        'text-[10px] font-medium px-1.5 py-0.5 rounded',
        prediction.risk_score >= 0.7 ? 'text-danger bg-danger/20' :
        prediction.risk_score >= 0.5 ? 'text-amber bg-amber/20' :
        'text-success bg-success/20',
      )}>{pct(prediction.risk_score)} risk</span>
      <span className="text-[10px] text-silver-muted/40 font-mono ml-auto">{pct(prediction.confidence)} conf</span>
    </div>
    {prediction.top_factors.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {prediction.top_factors.map((f, i) => (
          <span key={i} className="text-[10px] text-silver-muted/50 bg-charcoal/50 px-1.5 py-0.5 rounded font-mono">{f}</span>
        ))}
      </div>
    )}
    <div className="text-[10px] text-silver-muted/30 mt-1 font-mono">
      Model: {prediction.model_version} · Delay est: {prediction.predicted_delay_minutes.toFixed(0)}m
    </div>
  </div>
)

const DecisionCard: React.FC<{
  decision: WorkspaceSupportingDecision
}> = ({ decision }) => (
  <div className="px-3 py-2.5 hover:bg-charcoal/30 transition-colors">
    <div className="flex items-center gap-2 mb-1">
      <span className={clsx(
        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
        decision.decision_type === 'reroute' ? 'text-amber bg-amber/20' :
        decision.decision_type === 'alert' ? 'text-amber bg-amber/10' :
        'text-silver-muted/50 bg-charcoal',
      )}>{decision.decision_type}</span>
      <span className={clsx(
        'text-[10px] px-1.5 py-0.5 rounded',
        decision.outcome === 'success' ? 'text-success bg-success/20' :
        decision.outcome === 'failed' ? 'text-danger bg-danger/20' :
        'text-amber bg-amber/20',
      )}>
        {decision.outcome === 'success' ? <CheckCircle className="w-3 h-3 inline mr-0.5" weight="fill" /> :
         decision.outcome === 'failed' ? <XCircle className="w-3 h-3 inline mr-0.5" weight="fill" /> :
         <WarningCircle className="w-3 h-3 inline mr-0.5" weight="fill" />}
        {decision.outcome}
      </span>
    </div>
    <p className="text-[11px] text-silver/50 leading-relaxed line-clamp-2">{decision.reasoning}</p>
    <div className="text-[10px] text-silver-muted/30 mt-1 font-mono">
      Risk: {pct(decision.risk_score)} · {decision.timestamp ? new Date(decision.timestamp).toLocaleTimeString() : '--'}
    </div>
  </div>
)

export const WorkspaceResponse: React.FC<{
  response: WorkspaceResponseType
  onAction: (action: WorkspaceRecommendedAction) => void
}> = ({ response, onAction }) => {
  const trust = trustLevel(response.confidence)

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Summary + Confidence */}
      <div className="bg-graphite border border-slate/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            trust.label === 'High Confidence' ? 'bg-success/20' :
            trust.label === 'Medium Confidence' ? 'bg-amber/20' : 'bg-danger/20',
          )}>
            {trust.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-silver/90 leading-relaxed">{response.summary}</p>
            <div className="flex items-center gap-3 mt-3">
              <span className={clsx('text-[10px] font-medium flex items-center gap-1', trust.color)}>
                {trust.icon}
                {trust.label}
                <span className="text-silver-muted/40 font-mono ml-1">({pct(response.confidence)})</span>
              </span>
              <span className="text-[10px] text-silver-muted/30 font-medium capitalize">{response.intent.replace(/_/g, ' ')}</span>
            </div>
            {response.sources.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-silver-muted/40">Sources:</span>
                <div className="flex items-center gap-1.5">
                  {response.sources.map((src) => (
                    <span key={src} className="flex items-center gap-1 text-[10px] text-silver-muted/50 bg-charcoal/50 px-1.5 py-0.5 rounded font-mono">
                      {sourceIcon(src)}
                      {src}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Evidence */}
      {response.evidence.length > 0 && (
        <CollapsibleSection title="Evidence" icon={<SealCheck className="w-3.5 h-3.5" weight="fill" />} count={response.evidence.length}>
          {response.evidence.map((item, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs text-silver/70 leading-relaxed">
              <span className="text-amber/50 mt-0.5 shrink-0">●</span>
              <span>{item}</span>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Supporting Orders */}
      {response.supporting_orders.length > 0 && (
        <CollapsibleSection
          title="Supporting Orders"
          icon={<MapPin className="w-3.5 h-3.5" weight="fill" />}
          count={response.supporting_orders.length}
        >
          {response.supporting_orders.map((order) => (
            <OrderCard key={order.order_id} order={order} onAction={onAction} />
          ))}
        </CollapsibleSection>
      )}

      {/* Supporting Predictions */}
      {response.supporting_predictions.length > 0 && (
        <CollapsibleSection
          title="Supporting Predictions"
          icon={<Eye className="w-3.5 h-3.5" weight="fill" />}
          count={response.supporting_predictions.length}
        >
          {response.supporting_predictions.map((pred) => (
            <PredictionCard key={pred.order_id} prediction={pred} />
          ))}
        </CollapsibleSection>
      )}

      {/* Supporting Decisions */}
      {response.supporting_decisions.length > 0 && (
        <CollapsibleSection
          title="Supporting Decisions"
          icon={<Robot className="w-3.5 h-3.5" weight="fill" />}
          count={response.supporting_decisions.length}
        >
          {response.supporting_decisions.map((dec) => (
            <DecisionCard key={dec.decision_id} decision={dec} />
          ))}
        </CollapsibleSection>
      )}

      {/* Recommended Actions */}
      {response.recommended_actions.length > 0 && (
        <div className="bg-graphite border border-slate/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="w-3.5 h-3.5 text-amber" weight="bold" />
            <h3 className="text-xs font-semibold text-silver uppercase tracking-wider">Recommended Actions</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {response.recommended_actions.map((action) => (
              <ActionButton key={action.id} action={action} onAction={onAction} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

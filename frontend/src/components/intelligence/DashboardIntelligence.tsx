import React, { useState, useMemo } from 'react'
import { fleetStore, useOrdersArray } from '@/store/fleetStore'
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics'
import { FleetIntelligence } from './FleetIntelligence'
import { AgentIntelligence } from './AgentIntelligence'
import { OptimizationIntelligence } from './OptimizationIntelligence'
import { OperationalIntelligence } from './OperationalIntelligence'
import { ChartBar, Brain, ArrowsLeftRight, Gauge, Warning, Crosshair } from '@phosphor-icons/react'
import clsx from 'clsx'

export const DashboardIntelligence: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fleet' | 'agent' | 'optimization' | 'operational'>('fleet')
  const orders = useOrdersArray()
  const decisions = fleetStore((s) => s.agentDecisions)
  const { metrics, fleetHealth } = useDashboardMetrics()

  const realMetrics = useMemo(() => {
    const highRisk = orders.filter((o) => o.is_high_risk).length
    const healthScore = fleetHealth?.score ?? null
    const interventions = metrics?.agent_interventions ?? decisions.length
    const decisionsTotal = decisions.length

    return { highRisk, healthScore, interventions, decisionsTotal }
  }, [orders, fleetHealth, metrics, decisions])

  const tabs = [
    { key: 'fleet' as const, label: 'Fleet Intelligence', icon: Crosshair },
    { key: 'agent' as const, label: 'Agent Intelligence', icon: Brain },
    { key: 'optimization' as const, label: 'Optimization', icon: ArrowsLeftRight },
    { key: 'operational' as const, label: 'Operational', icon: Gauge },
  ]

  return (
    <div className="space-y-6">
      <div className="border-b border-steel-grey/30 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-pearl flex items-center gap-2">
              <ChartBar className="w-6 h-6 text-accent" />
              Intelligence Dashboard
            </h2>
            <p className="text-sm text-mist mt-1">
              Real-time operational intelligence from live fleet data
            </p>
          </div>
          {realMetrics.highRisk > 0 && (
            <div className="bg-critical/10 border border-critical/40 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Warning size={16} className="text-critical" />
                <div>
                  <p className="text-sm font-semibold text-critical">
                    {realMetrics.highRisk} High-Risk Order{realMetrics.highRisk !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-critical/70">
                    Intervention recommended
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="High-Risk Orders"
          value={`${realMetrics.highRisk}`}
          change={null}
          icon={<Warning size={14} />}
          status={realMetrics.highRisk > 3 ? 'critical' : realMetrics.highRisk > 0 ? 'warning' : 'normal'}
        />
        <MetricCard
          label="Fleet Health"
          value={realMetrics.healthScore !== null ? `${realMetrics.healthScore.toFixed(0)}%` : '—'}
          change={fleetHealth?.trend ?? null}
          icon={<Gauge size={14} />}
          status={realMetrics.healthScore !== null && realMetrics.healthScore < 50 ? 'critical' : realMetrics.healthScore !== null && realMetrics.healthScore < 80 ? 'warning' : 'normal'}
        />
        <MetricCard
          label="Agent Interventions"
          value={`${realMetrics.interventions}`}
          change={null}
          icon={<Brain size={14} />}
          status="normal"
        />
        <MetricCard
          label="Decisions (Total)"
          value={`${realMetrics.decisionsTotal}`}
          change={null}
          icon={<ChartBar size={14} />}
          status="normal"
        />
      </div>

      <div className="border-b border-steel-grey/30">
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'flex items-center gap-1.5 px-4 py-2 font-medium text-sm transition-colors relative',
                  activeTab === tab.key ? 'text-accent' : 'text-mist hover:text-cloud'
                )}
              >
                <Icon size={14} />
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        {activeTab === 'fleet' && <FleetIntelligence />}
        {activeTab === 'agent' && <AgentIntelligence />}
        {activeTab === 'optimization' && <OptimizationIntelligence />}
        {activeTab === 'operational' && <OperationalIntelligence />}
      </div>
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string
  change: number | null
  icon: React.ReactNode
  status: 'normal' | 'warning' | 'critical'
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, change, icon, status }) => {
  const statusColor = {
    normal: 'bg-success/10 border-success/40 text-success',
    warning: 'bg-warning/10 border-warning/40 text-warning',
    critical: 'bg-critical/10 border-critical/40 text-critical',
  }

  return (
    <div className={`border rounded-lg p-4 ${statusColor[status]}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-medium text-cloud">{label}</span>
        <div className="text-mist">{icon}</div>
      </div>
      <div className="text-2xl font-bold text-pearl mb-1">{value}</div>
      {change !== null && (
        <div className={`text-xs ${change > 0 ? 'text-success' : 'text-critical'}`}>
          {change > 0 ? '+' : ''}{change.toFixed(1)}% vs last period
        </div>
      )}
    </div>
  )
}

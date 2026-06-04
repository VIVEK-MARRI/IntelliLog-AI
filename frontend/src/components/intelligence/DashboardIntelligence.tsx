import React, { useState, useMemo } from 'react';
import { Activity, TrendingUp, AlertTriangle, Zap } from 'lucide-react';
import { UsageAnalytics } from './UsageAnalytics';
import { WorkflowInsights } from './WorkflowInsights';
import { OptimizationRecommendations } from './OptimizationRecommendations';
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics';

export const DashboardIntelligence: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'usage' | 'workflow' | 'optimization'>(
    'usage'
  );

  const { metrics } = useDashboardMetrics();

  const operatorMetrics = useMemo(() => {
    const totalActionsPerDay = metrics?.active_deliveries ?? 0;
    const avgResponseTime = metrics ? Math.max(500, Math.round(5000 - metrics.on_time_percentage * 25)) : 0;
    const riskAlertReviewTime = metrics ? Math.round(avgResponseTime * 0.8) : 0;
    const navigationEfficiency = metrics?.on_time_percentage ?? 0;

    return {
      totalActionsPerDay,
      avgResponseTime,
      riskAlertReviewTime,
      navigationEfficiency,
      decisionOverrideRate: metrics?.agent_interventions ?? 0,
      successRate: metrics?.on_time_percentage ?? 0,
    };
  }, [metrics]);

  const insights = useMemo(() => {
    const isHighResponseTime = operatorMetrics.avgResponseTime > 4000;
    const isLowEfficiency = operatorMetrics.navigationEfficiency < 70;
    const isHighOverrideRate = operatorMetrics.decisionOverrideRate > 20;

    return {
      criticalIssues: [
        ...(isHighResponseTime ? ['High response latency detected'] : []),
        ...(isLowEfficiency ? ['Low navigation efficiency'] : []),
        ...(isHighOverrideRate ? ['High decision override rate'] : []),
      ].length,
      improvementOpportunities: Math.max(1, Math.round((operatorMetrics.totalActionsPerDay || 0) / 10) || 1),
      estimatedImprovementPercentage: metrics ? Math.max(0, Math.round(100 - metrics.on_time_percentage)) : 0,
    };
  }, [operatorMetrics]);

  return (
    <div className="space-y-6">
      <div className="border-b border-steel-grey/30 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-pearl flex items-center gap-2">
              <Activity className="w-6 h-6 text-accent" />
              Dashboard Intelligence
            </h2>
            <p className="text-sm text-mist mt-1">
              Operator behavior analysis and workflow optimization
            </p>
          </div>
          {insights.criticalIssues > 0 && (
            <div className="bg-critical-DEFAULT/10 border border-critical-DEFAULT/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-critical-DEFAULT" />
                <div>
                  <p className="text-sm font-semibold text-critical-DEFAULT">
                    {insights.criticalIssues} Critical Issue{insights.criticalIssues !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-critical-DEFAULT/80">
                    Estimated improvement: {insights.estimatedImprovementPercentage}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Avg Response Time"
          value={`${(operatorMetrics.avgResponseTime / 1000).toFixed(1)}s`}
          change={-12}
          icon={<Zap className="w-4 h-4" />}
          status={operatorMetrics.avgResponseTime > 4000 ? 'warning' : 'normal'}
        />
        <MetricCard
          label="Navigation Efficiency"
          value={`${operatorMetrics.navigationEfficiency}%`}
          change={8}
          icon={<TrendingUp className="w-4 h-4" />}
          status={operatorMetrics.navigationEfficiency < 70 ? 'warning' : 'normal'}
        />
        <MetricCard
          label="Decision Override Rate"
          value={`${operatorMetrics.decisionOverrideRate}%`}
          change={-5}
          icon={<AlertTriangle className="w-4 h-4" />}
          status={operatorMetrics.decisionOverrideRate > 20 ? 'warning' : 'normal'}
        />
        <MetricCard
          label="Success Rate"
          value={`${operatorMetrics.successRate}%`}
          change={3}
          icon={<Activity className="w-4 h-4" />}
          status="normal"
        />
      </div>

      <div className="border-b border-steel-grey/30">
        <div className="flex gap-2">
          {(['usage', 'workflow', 'optimization'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium text-sm transition-colors relative ${
                activeTab === tab
                  ? 'text-accent'
                  : 'text-mist hover:text-cloud'
              }`}
            >
              {tab === 'usage' && 'Usage Analytics'}
              {tab === 'workflow' && 'Workflow Insights'}
              {tab === 'optimization' && 'Recommendations'}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"></div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeTab === 'usage' && <UsageAnalytics operatorMetrics={operatorMetrics} />}
        {activeTab === 'workflow' && <WorkflowInsights operatorMetrics={operatorMetrics} />}
        {activeTab === 'optimization' && <OptimizationRecommendations />}
      </div>
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: string;
  change: number;
  icon: React.ReactNode;
  status: 'normal' | 'warning' | 'critical';
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, change, icon, status }) => {
  const statusColor = {
    normal: 'bg-success-DEFAULT/10 border-success-DEFAULT/50 text-success-DEFAULT',
    warning: 'bg-warning-DEFAULT/10 border-warning-DEFAULT/50 text-warning-DEFAULT',
    critical: 'bg-critical-DEFAULT/10 border-critical-DEFAULT/50 text-critical-DEFAULT',
  };

  return (
    <div className={`border rounded-lg p-4 ${statusColor[status]}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-medium text-cloud">{label}</span>
        <div className="text-mist">{icon}</div>
      </div>
      <div className="text-2xl font-bold text-pearl mb-1">{value}</div>
      <div className={`text-xs ${change > 0 ? 'text-success-DEFAULT' : 'text-critical-DEFAULT'}`}>
        {change > 0 ? '+' : ''}{change}% from last period
      </div>
    </div>
  );
};

import React from 'react';
import { Lightbulb, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface WorkflowInsightsProps {
  operatorMetrics: {
    navigationEfficiency: number;
    decisionOverrideRate: number;
    successRate: number;
    avgResponseTime: number;
  };
}

export const WorkflowInsights: React.FC<WorkflowInsightsProps> = ({ operatorMetrics }) => {
  const insights = [
    {
      title: 'Navigation Efficiency Below Target',
      status: 'warning',
      icon: TrendingDown,
      current: operatorMetrics.navigationEfficiency,
      target: 85,
      description:
        'Operators are spending excessive time navigating between widgets. Recommended action: reorganize dashboard layout to reduce clicks.',
      recommendation: 'Move Risk Alerts above Fleet Map for faster access',
      potentialGain: '18%',
    },
    {
      title: 'High Decision Override Rate',
      status: 'warning',
      icon: AlertTriangle,
      current: operatorMetrics.decisionOverrideRate,
      target: 15,
      description:
        'Operators are frequently overriding AI recommendations. This could indicate either high-quality operator intuition or model inaccuracy.',
      recommendation: 'Review override patterns and retrain AI model if needed',
      potentialGain: '12%',
    },
    {
      title: 'Strong Success Rate',
      status: 'success',
      icon: CheckCircle2,
      current: operatorMetrics.successRate,
      target: 85,
      description:
        'Operators are maintaining a high success rate despite efficiency challenges. Continued optimization will drive further improvements.',
      recommendation: 'Monitor for burnout; consider workload balancing',
      potentialGain: '5%',
    },
  ];

  return (
    <div className="space-y-4">
      {insights.map((insight) => {
        const Icon = insight.icon;
        const statusColor =
          insight.status === 'warning'
            ? 'border-warning-DEFAULT/50 bg-warning-DEFAULT/10'
            : 'border-success-DEFAULT/50 bg-success-DEFAULT/10';
        const statusIconColor =
          insight.status === 'warning' ? 'text-warning-DEFAULT' : 'text-success-DEFAULT';

        return (
          <div key={insight.title} className={`border rounded-lg p-4 ${statusColor}`}>
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 mt-1 flex-shrink-0 ${statusIconColor}`} />
              <div className="flex-1">
                <h4 className="font-semibold text-pearl mb-2">{insight.title}</h4>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-abyss/50 rounded p-2 border border-steel-grey/30">
                    <p className="text-xs text-mist">Current</p>
                    <p className="text-lg font-bold text-pearl">{insight.current.toFixed(1)}</p>
                  </div>
                  <div className="bg-abyss/50 rounded p-2 border border-steel-grey/30">
                    <p className="text-xs text-mist">Target</p>
                    <p className="text-lg font-bold text-accent">{insight.target.toFixed(1)}</p>
                  </div>
                </div>

                <p className="text-sm text-cloud mb-3">{insight.description}</p>

                <div className="bg-abyss/50 rounded p-3 border border-steel-grey/30 mb-2">
                  <p className="text-xs font-medium text-mist mb-1">Action Item</p>
                  <p className="text-sm text-pearl">{insight.recommendation}</p>
                </div>

                <p className="text-xs text-mist">
                  <span className="font-semibold text-cloud">
                    Potential improvement: {insight.potentialGain}
                  </span>
                </p>
              </div>
            </div>
          </div>
        );
      })}

      <div className="bg-accent/10 border border-accent/50 rounded-lg p-4 mt-6">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-accent mt-1 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-accent mb-2">Optimization Opportunity</h4>
            <p className="text-sm text-accent/80">
              By implementing the recommended dashboard reorganization and reviewing decision
              override patterns, we estimate a combined 22% improvement in operational efficiency
              and response time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

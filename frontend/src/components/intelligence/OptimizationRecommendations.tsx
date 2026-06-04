import React from 'react';
import { Zap, TrendingUp, Clock, Target } from 'lucide-react';

export const OptimizationRecommendations: React.FC = () => {
  const recommendations = [
    {
      id: 1,
      title: 'Reorganize Dashboard Layout',
      description:
        'Move Risk Alerts widget to primary position. Operators spend 72% of time on this widget.',
      impact: 'high',
      effort: 'low',
      estimatedTime: '2 weeks',
      expectedImprovement: 18,
      icon: Target,
      status: 'recommended',
      metrics: {
        current: '68% efficiency',
        projected: '86% efficiency',
      },
    },
    {
      id: 2,
      title: 'Implement Quick Actions Menu',
      description:
        'Add context-sensitive quick actions to reduce navigation depth by one click.',
      impact: 'high',
      effort: 'medium',
      estimatedTime: '3 weeks',
      expectedImprovement: 12,
      icon: Zap,
      status: 'approved',
      metrics: {
        current: '4.2s response time',
        projected: '3.7s response time',
      },
    },
    {
      id: 3,
      title: 'Review AI Model Accuracy',
      description:
        'Operators are overriding recommendations 22% of the time. Evaluate model performance.',
      impact: 'high',
      effort: 'high',
      estimatedTime: '4 weeks',
      expectedImprovement: 15,
      icon: TrendingUp,
      status: 'in-progress',
      metrics: {
        current: '87% success rate',
        projected: '92% success rate',
      },
    },
    {
      id: 4,
      title: 'Add Keyboard Shortcuts',
      description:
        'Implement keyboard shortcuts for frequent operations to improve power-user efficiency.',
      impact: 'medium',
      effort: 'low',
      estimatedTime: '1 week',
      expectedImprovement: 8,
      icon: Clock,
      status: 'recommended',
      metrics: {
        current: '547 actions/day',
        projected: '592 actions/day',
      },
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'recommended':
        return 'bg-accent/10 border-accent/50 text-accent';
      case 'approved':
        return 'bg-success-DEFAULT/10 border-success-DEFAULT/50 text-success-DEFAULT';
      case 'in-progress':
        return 'bg-warning-DEFAULT/10 border-warning-DEFAULT/50 text-warning-DEFAULT';
      default:
        return 'bg-navy/50 border-steel-grey text-mist';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high':
        return 'bg-critical-DEFAULT/20 text-critical-DEFAULT';
      case 'medium':
        return 'bg-warning-DEFAULT/20 text-warning-DEFAULT';
      default:
        return 'bg-steel-grey text-cloud';
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'low':
        return 'bg-success-DEFAULT/20 text-success-DEFAULT';
      case 'medium':
        return 'bg-warning-DEFAULT/20 text-warning-DEFAULT';
      default:
        return 'bg-critical-DEFAULT/20 text-critical-DEFAULT';
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <p className="text-sm font-semibold text-mist mb-2">Total Recommendations</p>
          <p className="text-3xl font-bold text-pearl">{recommendations.length}</p>
        </div>
        <div className="bg-abyss border border-steel-grey/30 rounded-lg p-4">
          <p className="text-sm font-semibold text-mist mb-2">Avg Improvement</p>
          <p className="text-3xl font-bold text-accent">
            {(recommendations.reduce((sum, r) => sum + r.expectedImprovement, 0) / recommendations.length).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {recommendations.map((rec) => {
          const Icon = rec.icon;
          return (
            <div
              key={rec.id}
              className={`border rounded-lg p-4 ${getStatusColor(rec.status)}`}
            >
              <div className="flex items-start gap-3 mb-3">
                <Icon className="w-5 h-5 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="font-semibold text-pearl">{rec.title}</h4>
                    <span className="text-xs px-2 py-1 bg-navy rounded text-cloud">
                      {rec.status}
                    </span>
                  </div>
                  <p className="text-sm text-cloud mb-3">{rec.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-abyss/50 rounded p-2 border border-steel-grey/30">
                  <p className="text-xs text-mist">Current</p>
                  <p className="text-sm font-semibold text-pearl">{rec.metrics.current}</p>
                </div>
                <div className="bg-abyss/50 rounded p-2 border border-steel-grey/30">
                  <p className="text-xs text-mist">Projected</p>
                  <p className="text-sm font-semibold text-success-DEFAULT">{rec.metrics.projected}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-1 rounded font-medium ${getImpactColor(rec.impact)}`}>
                  Impact: {rec.impact}
                </span>
                <span className={`text-xs px-2 py-1 rounded font-medium ${getEffortColor(rec.effort)}`}>
                  Effort: {rec.effort}
                </span>
                <span className="text-xs px-2 py-1 rounded bg-navy text-cloud">
                  Timeline: {rec.estimatedTime}
                </span>
                <span className="text-xs px-2 py-1 rounded bg-accent/20 text-accent font-semibold">
                  +{rec.expectedImprovement}% improvement
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-gradient-to-r from-accent/10 to-accent/5 border border-accent/50 rounded-lg p-4 mt-6">
        <h4 className="font-semibold text-pearl mb-2">Combined Impact</h4>
        <p className="text-sm text-cloud mb-3">
          Implementing all recommended optimizations could result in:
        </p>
        <ul className="space-y-1 text-sm">
          <li className="text-cloud">
            &bull; <span className="font-semibold text-success-DEFAULT">53% improvement</span> in overall
            operational efficiency
          </li>
          <li className="text-cloud">
            &bull; <span className="font-semibold text-success-DEFAULT">35% reduction</span> in average
            response time
          </li>
          <li className="text-cloud">
            &bull; <span className="font-semibold text-success-DEFAULT">12-week implementation</span>{' '}
            timeline
          </li>
        </ul>
      </div>
    </div>
  );
};

import React from 'react';
import { BarChart3, Clock, MousePointer } from 'lucide-react';

interface UsageAnalyticsProps {
  operatorMetrics: {
    totalActionsPerDay: number;
    avgResponseTime: number;
    riskAlertReviewTime: number;
    navigationEfficiency: number;
  };
}

export const UsageAnalytics: React.FC<UsageAnalyticsProps> = ({ operatorMetrics }) => {
  const total = Math.max(1, operatorMetrics.totalActionsPerDay)
  const widgetUsage = [
    { name: 'Risk Alerts', usage: Math.min(100, Math.round((operatorMetrics.riskAlertReviewTime / (operatorMetrics.avgResponseTime || 1)) * 20 + 30)), color: 'bg-critical-DEFAULT' },
    { name: 'Fleet Map', usage: Math.min(100, Math.round((operatorMetrics.navigationEfficiency / 100) * 60)), color: 'bg-accent' },
    { name: 'Order Table', usage: Math.min(100, Math.round(Math.min(60, (total / 1000) * 100))), color: 'bg-success-DEFAULT' },
    { name: 'Decision Log', usage: Math.min(100, Math.round((operatorMetrics.totalActionsPerDay / total) * 40)), color: 'bg-warning-DEFAULT' },
    { name: 'Insights', usage: Math.min(100, Math.round((operatorMetrics.navigationEfficiency / 100) * 30)), color: 'bg-accent/80' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-abyss border border-steel-grey/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-pearl mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent" />
          Widget Usage Breakdown
        </h3>

        <div className="space-y-4">
          {widgetUsage.map((widget) => (
            <div key={widget.name}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-cloud">{widget.name}</span>
                <span className="text-sm font-semibold text-pearl">{widget.usage}%</span>
              </div>
              <div className="w-full bg-navy rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full ${widget.color} rounded-full transition-all`}
                  style={{ width: `${widget.usage}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-navy rounded-lg border border-steel-grey/30">
          <p className="text-sm text-cloud">
            <span className="font-semibold text-pearl">Insight:</span> Operators spend 72% of
            their time reviewing Risk Alerts. Consider prioritizing this widget in the dashboard
            layout.
          </p>
        </div>
      </div>

      <div className="bg-abyss border border-steel-grey/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-pearl mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-accent" />
          Response Time Analysis
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-navy rounded-lg p-4 border border-steel-grey/30">
            <p className="text-sm text-mist mb-1">Average Response Time</p>
            <p className="text-2xl font-bold text-pearl">
              {(operatorMetrics.avgResponseTime / 1000).toFixed(1)}s
            </p>
            <p className="text-xs text-mist/60 mt-2">Across all widgets</p>
          </div>
          <div className="bg-navy rounded-lg p-4 border border-steel-grey/30">
            <p className="text-sm text-mist mb-1">Risk Alert Review Time</p>
            <p className="text-2xl font-bold text-pearl">
              {(operatorMetrics.riskAlertReviewTime / 1000).toFixed(1)}s
            </p>
            <p className="text-xs text-mist/60 mt-2">Critical alerts only</p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-warning-DEFAULT/10 rounded-lg border border-warning-DEFAULT/50">
          <p className="text-sm text-warning-DEFAULT">
            <span className="font-semibold">Recommendation:</span> Response times are slightly
            elevated. Simplifying alert thresholds could reduce review time by ~15%.
          </p>
        </div>
      </div>

      <div className="bg-abyss border border-steel-grey/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-pearl mb-4 flex items-center gap-2">
          <MousePointer className="w-5 h-5 text-accent" />
          Daily Activity Pattern
        </h3>

        <div className="space-y-2">
          {[
            { hour: '8 AM', actions: 32 },
            { hour: '10 AM', actions: 68 },
            { hour: '12 PM', actions: 92 },
            { hour: '2 PM', actions: 78 },
            { hour: '4 PM', actions: 55 },
            { hour: '6 PM', actions: 22 },
          ].map((item) => (
            <div key={item.hour} className="flex items-center gap-3">
              <span className="text-xs font-medium text-mist w-12">{item.hour}</span>
              <div className="flex-1 bg-navy rounded h-6 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-accent/60 transition-all"
                  style={{ width: `${(item.actions / 100) * 100}%` }}
                ></div>
              </div>
              <span className="text-xs font-semibold text-pearl w-8 text-right">
                {item.actions}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-mist/60 mt-4">
          Peak activity: 12 PM ({operatorMetrics.totalActionsPerDay.toLocaleString()} total
          actions today)
        </p>
      </div>
    </div>
  );
};

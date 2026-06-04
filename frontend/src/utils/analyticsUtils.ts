/**
 * Analytics and business intelligence utilities
 */

export interface OperatorBehaviorMetrics {
  operatorId: string;
  totalActionsPerDay: number;
  avgResponseTime: number; // ms
  riskAlertReviewTime: number; // ms
  navigationEfficiency: number; // 0-100
  decisionOverrideRate: number; // percentage
  successRate: number; // percentage
}

export interface WorkflowInsight {
  title: string;
  description: string;
  metric: number;
  unit: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
}

export interface OptimizationOpportunity {
  title: string;
  currentMetric: number;
  targetMetric: number;
  estimatedImprovement: number; // percentage
  effortLevel: 'low' | 'medium' | 'high';
  impact: 'high' | 'medium' | 'low';
}

/**
 * Calculate operator behavior score (0-100)
 */
export const calculateBehaviorScore = (metrics: OperatorBehaviorMetrics): number => {
  const responseScore = Math.max(0, 100 - (metrics.avgResponseTime / 1000) * 10); // Lower is better
  const efficiencyScore = metrics.navigationEfficiency;
  const overrideScore = Math.max(0, 100 - metrics.decisionOverrideRate * 2); // Lower override rate is better
  const successScore = metrics.successRate;

  return (responseScore + efficiencyScore + overrideScore + successScore) / 4;
};

/**
 * Generate workflow insights based on operator behavior
 */
export const generateWorkflowInsights = (
  operatorMetrics: OperatorBehaviorMetrics[]
): WorkflowInsight[] => {
  const insights: WorkflowInsight[] = [];

  // Calculate average metrics
  const avgResponseTime =
    operatorMetrics.reduce((sum, m) => sum + m.avgResponseTime, 0) / operatorMetrics.length;
  const avgEfficiency =
    operatorMetrics.reduce((sum, m) => sum + m.navigationEfficiency, 0) / operatorMetrics.length;
  const avgOverrideRate =
    operatorMetrics.reduce((sum, m) => sum + m.decisionOverrideRate, 0) / operatorMetrics.length;

  // Response time insight
  if (avgResponseTime > 5000) {
    insights.push({
      title: 'High Response Latency',
      description: 'Operators are taking longer than optimal to respond to alerts.',
      metric: avgResponseTime / 1000,
      unit: 'seconds',
      recommendation: 'Consider simplifying alert UI or providing more actionable alerts.',
      priority: 'high',
    });
  }

  // Navigation efficiency insight
  if (avgEfficiency < 70) {
    insights.push({
      title: 'Low Navigation Efficiency',
      description: 'Operators are inefficient in navigating the dashboard.',
      metric: avgEfficiency,
      unit: '%',
      recommendation: 'Reorganize dashboard layout to prioritize frequently used features.',
      priority: 'high',
    });
  }

  // Decision override insight
  if (avgOverrideRate > 15) {
    insights.push({
      title: 'High Decision Override Rate',
      description: 'Operators are frequently overriding system recommendations.',
      metric: avgOverrideRate,
      unit: '%',
      recommendation:
        'Review AI model accuracy or retrain operators on recommendation rationale.',
      priority: 'medium',
    });
  }

  return insights;
};

/**
 * Generate optimization recommendations
 */
export const generateOptimizations = (
  currentMetrics: Record<string, number>,
  benchmarks: Record<string, number>
): OptimizationOpportunity[] => {
  const opportunities: OptimizationOpportunity[] = [];

  Object.entries(currentMetrics).forEach(([metric, current]) => {
    const target = benchmarks[metric];
    if (!target) return;

    const improvement = ((target - current) / current) * 100;
    if (improvement > 5) {
      opportunities.push({
        title: `Improve ${metric}`,
        currentMetric: current,
        targetMetric: target,
        estimatedImprovement: improvement,
        effortLevel: improvement > 20 ? 'high' : improvement > 10 ? 'medium' : 'low',
        impact: improvement > 20 ? 'high' : improvement > 10 ? 'medium' : 'low',
      });
    }
  });

  return opportunities.sort((a, b) => b.estimatedImprovement - a.estimatedImprovement);
};

/**
 * Calculate cohort analysis metrics
 */
export const calculateCohortMetrics = (
  data: Array<{
    timestamp: string;
    value: number;
    dimension: string;
  }>,
  dimensionGroups: string[]
): Record<string, number> => {
  const result: Record<string, number> = {};

  dimensionGroups.forEach((group) => {
    const groupData = data.filter((d) => d.dimension === group);
    const avg = groupData.reduce((sum, d) => sum + d.value, 0) / groupData.length;
    result[group] = Math.round(avg * 100) / 100;
  });

  return result;
};

/**
 * Detect anomalies in metrics
 */
export const detectAnomalies = (
  dataPoints: number[],
  threshold: number = 2 // standard deviations
): number[] => {
  if (dataPoints.length < 3) return [];

  const mean = dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
  const variance =
    dataPoints.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / dataPoints.length;
  const stdDev = Math.sqrt(variance);

  const anomalies: number[] = [];
  dataPoints.forEach((point, idx) => {
    if (Math.abs(point - mean) > threshold * stdDev) {
      anomalies.push(idx);
    }
  });

  return anomalies;
};

/**
 * Calculate trend direction and momentum
 */
export const calculateTrend = (
  dataPoints: number[]
): { direction: 'up' | 'down' | 'flat'; momentum: number } => {
  if (dataPoints.length < 2) return { direction: 'flat', momentum: 0 };

  const recent = dataPoints.slice(-5);
  const older = dataPoints.slice(-10, -5);

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;

  const momentum = ((recentAvg - olderAvg) / olderAvg) * 100;
  const direction = Math.abs(momentum) < 1 ? 'flat' : momentum > 0 ? 'up' : 'down';

  return { direction, momentum: Math.round(momentum * 100) / 100 };
};

/**
 * Generate daily/weekly/monthly summary
 */
export const generateSummary = (
  period: 'day' | 'week' | 'month',
  metrics: Record<string, number>
): string => {
  const periodName = { day: 'today', week: 'this week', month: 'this month' };
  const entries = Object.entries(metrics)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);

  let summary = `Summary ${periodName[period]}: `;
  summary += entries.map(([key, val]) => `${key} was ${val.toFixed(1)}`).join('; ');

  return summary + '.';
};

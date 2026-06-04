/**
 * Dashboard utility functions
 */

export interface DashboardLayout {
  mode: 'operations' | 'executive';
  layout: 'default' | 'compact' | 'expanded';
}

export interface WidgetVisibility {
  fleetMap: boolean;
  orderTable: boolean;
  riskExplainer: boolean;
  decisionLog: boolean;
  fleetHealth: boolean;
  operationsInsights: boolean;
  copilot: boolean;
  analytics: boolean;
}

export interface DashboardPreferences {
  theme: 'dark' | 'light';
  layout: DashboardLayout;
  visibility: WidgetVisibility;
  refreshInterval: number; // ms
  alertVolume: 'mute' | 'low' | 'normal' | 'high';
}

/**
 * Get default dashboard preferences
 */
export const getDefaultPreferences = (): DashboardPreferences => ({
  theme: 'dark',
  layout: {
    mode: 'operations',
    layout: 'default',
  },
  visibility: {
    fleetMap: true,
    orderTable: true,
    riskExplainer: true,
    decisionLog: true,
    fleetHealth: true,
    operationsInsights: true,
    copilot: true,
    analytics: false,
  },
  refreshInterval: 5000,
  alertVolume: 'normal',
});

/**
 * Get widget visibility for current mode
 */
export const getWidgetVisibilityForMode = (
  mode: 'operations' | 'executive'
): Partial<WidgetVisibility> => {
  switch (mode) {
    case 'executive':
      return {
        fleetMap: true,
        orderTable: true,
        riskExplainer: false,
        decisionLog: false,
        fleetHealth: true,
        operationsInsights: true,
        copilot: true,
        analytics: true,
      };
    case 'operations':
    default:
      return {
        fleetMap: true,
        orderTable: true,
        riskExplainer: true,
        decisionLog: true,
        fleetHealth: true,
        operationsInsights: true,
        copilot: true,
        analytics: false,
      };
  }
};

/**
 * Calculate dashboard metrics
 */
export interface DashboardMetricsCalculation {
  totalOrders: number;
  activeOrders: number;
  completedToday: number;
  delayedOrders: number;
  highRiskOrders: number;
  averageDelay: number;
  onTimeRate: number;
  fleetEfficiency: number;
}

export const calculateDashboardMetrics = (
  orders: Array<{
    status: string;
    delay_minutes: number;
    is_high_risk: boolean;
    eta_time?: string;
  }>,
  fleetHealth?: { efficiency_score?: number }
): DashboardMetricsCalculation => {
  const total = orders.length;
  const active = orders.filter((o) => o.status === 'in_transit').length;
  const completed = orders.filter((o) => o.status === 'delivered').length;
  const delayed = orders.filter((o) => o.delay_minutes > 0).length;
  const highRisk = orders.filter((o) => o.is_high_risk).length;

  const avgDelay = total > 0 ? orders.reduce((sum, o) => sum + o.delay_minutes, 0) / total : 0;
  const onTimeRate = completed > 0 ? ((completed - delayed) / completed) * 100 : 0;
  const fleetEff = fleetHealth?.efficiency_score || 0;

  return {
    totalOrders: total,
    activeOrders: active,
    completedToday: completed,
    delayedOrders: delayed,
    highRiskOrders: highRisk,
    averageDelay: avgDelay,
    onTimeRate,
    fleetEfficiency: fleetEff,
  };
};

/**
 * Get dashboard widget layout for grid
 */
export const getWidgetGridLayout = (
  mode: 'operations' | 'executive',
  layout: 'default' | 'compact' | 'expanded'
): Record<string, { col: number; row: number; width: number; height: number }> => {
  if (mode === 'executive' && layout === 'expanded') {
    return {
      fleetMap: { col: 1, row: 1, width: 2, height: 3 },
      fleetHealth: { col: 3, row: 1, width: 1, height: 2 },
      operationsInsights: { col: 3, row: 3, width: 1, height: 1 },
      analytics: { col: 1, row: 4, width: 2, height: 2 },
      copilot: { col: 3, row: 4, width: 1, height: 2 },
    };
  }

  if (mode === 'executive') {
    return {
      fleetHealth: { col: 1, row: 1, width: 1, height: 1 },
      operationsInsights: { col: 2, row: 1, width: 1, height: 1 },
      analytics: { col: 3, row: 1, width: 1, height: 1 },
      copilot: { col: 1, row: 2, width: 3, height: 1 },
    };
  }

  // Operations mode
  return {
    fleetMap: { col: 1, row: 1, width: 2, height: 2 },
    orderTable: { col: 1, row: 3, width: 2, height: 2 },
    riskExplainer: { col: 3, row: 1, width: 1, height: 1 },
    decisionLog: { col: 3, row: 2, width: 1, height: 2 },
    fleetHealth: { col: 3, row: 4, width: 1, height: 1 },
    copilot: { col: 1, row: 5, width: 3, height: 1 },
  };
};

/**
 * Check if alerts should be shown based on preferences
 */
export const shouldShowAlert = (
  alertVolume: 'mute' | 'low' | 'normal' | 'high',
  alertSeverity: 'critical' | 'high' | 'medium' | 'low'
): boolean => {
  switch (alertVolume) {
    case 'mute':
      return false;
    case 'low':
      return alertSeverity === 'critical';
    case 'normal':
      return ['critical', 'high', 'medium'].includes(alertSeverity);
    case 'high':
      return true;
  }
};

/**
 * Format dashboard time range for API calls
 */
export const formatTimeRange = (
  range: 'today' | 'week' | 'month'
): { startTime: string; endTime: string } => {
  const now = new Date();
  const start = new Date();

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start.setMonth(now.getMonth() - 1);
      break;
  }

  return {
    startTime: start.toISOString(),
    endTime: now.toISOString(),
  };
};

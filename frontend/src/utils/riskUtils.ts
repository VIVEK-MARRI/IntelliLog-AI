/**
 * Risk utility functions for classification and analysis
 */

export const getRiskLevel = (riskScore: number): 'low' | 'medium' | 'high' => {
  if (riskScore < 30) return 'low';
  if (riskScore < 70) return 'medium';
  return 'high';
};

export const getRiskColor = (riskScore: number): string => {
  const level = getRiskLevel(riskScore);
  switch (level) {
    case 'low':
      return 'text-green-400';
    case 'medium':
      return 'text-amber-400';
    case 'high':
      return 'text-red-400';
  }
};

export const getRiskBgColor = (riskScore: number): string => {
  const level = getRiskLevel(riskScore);
  switch (level) {
    case 'low':
      return 'bg-green-400/10 border-green-500/50';
    case 'medium':
      return 'bg-amber-400/10 border-amber-500/50';
    case 'high':
      return 'bg-red-400/10 border-red-500/50';
  }
};

export const getRiskLabel = (riskScore: number): string => {
  const level = getRiskLevel(riskScore);
  switch (level) {
    case 'low':
      return 'Low Risk';
    case 'medium':
      return 'Medium Risk';
    case 'high':
      return 'High Risk';
  }
};

/**
 * Calculate risk trend (arrow direction)
 */
export const getRiskTrend = (
  current: number,
  previous: number
): 'up' | 'down' | 'stable' => {
  const difference = current - previous;
  if (Math.abs(difference) < 2) return 'stable';
  return difference > 0 ? 'up' : 'down';
};

/**
 * Calculate risk change percentage
 */
export const calculateRiskChange = (current: number, previous: number): number => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Classify risk factors as risk-increasing (+) or risk-decreasing (-)
 */
export const classifyRiskFactor = (
  _factor: string,
  contribution: number
): 'increases' | 'decreases' => {
  return contribution > 0 ? 'increases' : 'decreases';
};

/**
 * Get human-readable risk explanation
 */
export const getRiskExplanation = (riskScore: number): string => {
  const level = getRiskLevel(riskScore);
  switch (level) {
    case 'low':
      return 'This shipment has minimal risk of delay or issues.';
    case 'medium':
      return 'This shipment has moderate risk. Monitor closely for potential delays.';
    case 'high':
      return 'This shipment has significant risk. Proactive intervention recommended.';
  }
};

/**
 * Determine if reroute is recommended based on risk score
 */
export const shouldRerouteRecommend = (riskScore: number, delayMinutes: number): boolean => {
  return riskScore > 75 || delayMinutes > 30;
};

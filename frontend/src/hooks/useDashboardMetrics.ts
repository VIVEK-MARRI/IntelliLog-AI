import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { predictionsAPI } from '../api/predictions';
import { useFleetStore } from '../store/fleetStore';

/**
 * Custom hook for dashboard metrics and recommendations
 * Integrates with React Query for caching and background updates
 */
export const useDashboardMetrics = () => {
  const { orders } = useFleetStore();

  // Fetch operational metrics
  const metricsQuery = useQuery({
    queryKey: ['metrics', 'operational'],
    queryFn: () => predictionsAPI.getOperationalMetrics(),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  // Fetch recommendations
  const recommendationsQuery = useQuery({
    queryKey: ['metrics', 'recommendations'],
    queryFn: () => predictionsAPI.getRecommendations(),
    staleTime: 30000,
    refetchInterval: 120000, // Refetch every 2 minutes
  });

  // Fetch fleet health
  const fleetHealthQuery = useQuery({
    queryKey: ['metrics', 'fleet-health'],
    queryFn: () => predictionsAPI.getFleetHealth(),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Fetch delay causes
  const delayCausesQuery = useQuery({
    queryKey: ['metrics', 'delay-causes'],
    queryFn: () => predictionsAPI.getDelayCauses(),
    staleTime: 60000, // 60 seconds
    refetchInterval: 120000,
  });

  // Compute critical metrics
  const criticalMetrics = useMemo(() => {
    const total = orders.size;
    const delayed = Array.from(orders.values()).filter((o) => o.delay_minutes > 0).length;
    const highRisk = Array.from(orders.values()).filter((o) => o.is_high_risk).length;

    return {
      totalOrders: total,
      delayedOrders: delayed,
      highRiskOrders: highRisk,
      delayRate: total > 0 ? (delayed / total) * 100 : 0,
      riskRate: total > 0 ? (highRisk / total) * 100 : 0,
      avgDelay: total > 0
        ? Array.from(orders.values()).reduce((sum, o) => sum + o.delay_minutes, 0) / total
        : 0,
    };
  }, [orders]);

  // Filter high-priority recommendations
  const priorityRecommendations = useMemo(() => {
    if (!recommendationsQuery.data) return [];
    return recommendationsQuery.data
      .filter((rec) => rec.priority === 'high')
      .slice(0, 5);
  }, [recommendationsQuery.data]);

  // Check if metrics are loading
  const isLoading =
    metricsQuery.isLoading ||
    recommendationsQuery.isLoading ||
    fleetHealthQuery.isLoading;

  // Check if any query failed
  const isError =
    metricsQuery.isError ||
    recommendationsQuery.isError ||
    fleetHealthQuery.isError;

  const refetch = useCallback(() => {
    metricsQuery.refetch();
    recommendationsQuery.refetch();
    fleetHealthQuery.refetch();
    delayCausesQuery.refetch();
  }, [metricsQuery, recommendationsQuery, fleetHealthQuery, delayCausesQuery]);

  return {
    // Metrics
    metrics: metricsQuery.data,
    fleetHealth: fleetHealthQuery.data,
    delayCauses: delayCausesQuery.data,
    recommendations: recommendationsQuery.data,
    priorityRecommendations,
    criticalMetrics,

    // Loading/error states
    isLoading,
    isError,
    isLoadingMetrics: metricsQuery.isLoading,
    isLoadingRecommendations: recommendationsQuery.isLoading,

    // Utilities
    refetch,
  };
};

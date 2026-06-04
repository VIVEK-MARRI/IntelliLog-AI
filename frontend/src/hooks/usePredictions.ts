import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { predictionsAPI } from '../api/predictions';

/**
 * Custom hook for prediction and risk data
 * Handles fetching predictions, feature importance, and model info
 */
export const usePredictions = () => {
  // Get model info
  const modelInfoQuery = useQuery({
    queryKey: ['predictions', 'model-info'],
    queryFn: () => predictionsAPI.getModelInfo(),
    staleTime: Infinity, // Model info rarely changes
  });

  // Fetch prediction for a specific order
  const getPrediction = useCallback((orderId: string) => {
    return useQuery({
      queryKey: ['predictions', orderId],
      queryFn: () => predictionsAPI.getPrediction(orderId),
      enabled: !!orderId,
      staleTime: 15000, // 15 seconds
    });
  }, []);

  // Fetch risk history for an order
  const getRiskHistory = useCallback((orderId: string, limit = 24) => {
    return useQuery({
      queryKey: ['predictions', orderId, 'history', limit],
      queryFn: () => predictionsAPI.getRiskHistory(orderId, limit),
      enabled: !!orderId,
      staleTime: 30000,
    });
  }, []);

  // Get batch predictions for multiple orders
  const getBatchPredictions = useCallback((orderIds: string[]) => {
    return useQuery({
      queryKey: ['predictions', 'batch', orderIds],
      queryFn: () => predictionsAPI.getBatchPredictions(orderIds),
      enabled: orderIds.length > 0,
      staleTime: 15000,
    });
  }, []);

  // Get feature importance
  const featureImportanceQuery = useQuery({
    queryKey: ['predictions', 'feature-importance'],
    queryFn: () => predictionsAPI.getFeatureImportance(),
    staleTime: 60000, // 60 seconds
  });

  // Compute model metrics
  const modelMetrics = useMemo(() => {
    if (!modelInfoQuery.data) return null;

    return {
      version: modelInfoQuery.data.version,
      accuracy: modelInfoQuery.data.accuracy || 0,
      f1Score: modelInfoQuery.data.f1_score || 0,
      latencyMs: modelInfoQuery.data.latency_ms || 0,
      lastUpdated: modelInfoQuery.data.last_updated,
    };
  }, [modelInfoQuery.data]);

  const isLoading = modelInfoQuery.isLoading || featureImportanceQuery.isLoading;
  const isError = modelInfoQuery.isError || featureImportanceQuery.isError;

  return {
    // Queries
    modelInfo: modelInfoQuery.data,
    modelMetrics,
    featureImportance: featureImportanceQuery.data,

    // Query states
    isLoading,
    isError,
    isLoadingModelInfo: modelInfoQuery.isLoading,

    // Utilities
    getPrediction,
    getRiskHistory,
    getBatchPredictions,
    refetch: () => {
      modelInfoQuery.refetch();
      featureImportanceQuery.refetch();
    },
  };
};

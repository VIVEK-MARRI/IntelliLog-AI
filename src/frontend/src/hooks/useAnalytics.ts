import { useCallback } from 'react';
import { apiClient, type LogisticsMetrics } from '../api';
import { useApiData } from './useApiData';

export function useAnalytics() {
  const fetchMetrics = useCallback(() => apiClient.getLogisticsMetrics(), []);
  return useApiData<LogisticsMetrics>(fetchMetrics, {
    retries: 1,
    pollIntervalMs: 60_000,
  });
}

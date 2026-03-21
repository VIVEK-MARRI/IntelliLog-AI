import { useCallback } from 'react';
import { apiClient, type SystemStatus } from '../api';
import { useApiData } from './useApiData';

export function useHealthStatus() {
  const fetchHealth = useCallback(() => apiClient.getSystemStatus(), []);
  const state = useApiData<SystemStatus>(fetchHealth, {
    initialData: { status: 'degraded' },
    retries: 1,
    pollIntervalMs: 30_000,
  });

  return {
    ...state,
    health: state.data,
    refreshHealth: state.refetch,
  };
}

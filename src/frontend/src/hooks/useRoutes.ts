import { useCallback } from 'react';
import { apiClient, type RouteRecord } from '../api';
import { useApiData } from './useApiData';

export function useRoutes(status?: string) {
  const fetchRoutes = useCallback(() => apiClient.getRoutes({ status }), [status]);
  return useApiData<RouteRecord[]>(fetchRoutes, {
    initialData: [],
    retries: 2,
    pollIntervalMs: 45_000,
  });
}

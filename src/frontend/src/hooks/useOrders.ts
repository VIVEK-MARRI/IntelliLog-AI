import { useCallback } from 'react';
import { apiClient, type OrderRecord } from '../api';
import { useApiData } from './useApiData';

export function useOrders(status?: string) {
  const fetchOrders = useCallback(() => apiClient.getOrders({ status }), [status]);
  return useApiData<OrderRecord[]>(fetchOrders, {
    initialData: [],
    retries: 2,
    pollIntervalMs: 30_000,
  });
}

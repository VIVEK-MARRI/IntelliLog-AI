import { useCallback } from 'react';
import { apiClient, type DriverTracking } from '../api';
import { useApiData } from './useApiData';

export function useDrivers(lat = 17.44, lon = 78.44, radiusKm = 50) {
  const fetchDrivers = useCallback(() => apiClient.getDriversNearby(lat, lon, radiusKm), [lat, lon, radiusKm]);

  return useApiData<DriverTracking[]>(fetchDrivers, {
    initialData: [],
    retries: 2,
    pollIntervalMs: 30_000,
  });
}

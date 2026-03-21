import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseApiDataOptions<T> {
  enabled?: boolean;
  initialData?: T;
  pollIntervalMs?: number;
  retries?: number;
  onError?: (error: unknown) => void;
}

export function useApiData<T>(
  fetcher: () => Promise<T>,
  options: UseApiDataOptions<T> = {}
): {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
} {
  const { enabled = true, initialData, pollIntervalMs, retries = 1, onError } = options;
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);

  const run = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    let attempts = 0;
    while (attempts <= retries) {
      try {
        const result = await fetcher();
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
        return;
      } catch (err) {
        attempts += 1;
        if (attempts > retries) {
          if (mountedRef.current) {
            setError(err);
            setLoading(false);
          }
          onError?.(err);
        }
      }
    }
  }, [enabled, fetcher, onError, retries]);

  useEffect(() => {
    mountedRef.current = true;
    void run();
    return () => {
      mountedRef.current = false;
    };
  }, [run]);

  useEffect(() => {
    if (!pollIntervalMs || !enabled) return;
    const timer = window.setInterval(() => {
      void run();
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollIntervalMs, run]);

  return { data, loading, error, refetch: run, setData };
}

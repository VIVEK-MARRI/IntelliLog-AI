import { useCallback, useState } from 'react';
import { apiClient, type ETAExplanation } from '../api';

export function useExplanation() {
  const [explanation, setExplanation] = useState<ETAExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const getExplanation = useCallback(async (orderId: string, driverId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiClient.getExplanation(orderId, driverId);
      setExplanation(next);
      return next;
    } catch (err) {
      setError(err);
      setExplanation(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    explanation,
    loading,
    error,
    getExplanation,
  };
}

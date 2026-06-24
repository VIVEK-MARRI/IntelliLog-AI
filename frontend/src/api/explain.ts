/**
 * Explainability Studio API
 */

import { apiClient } from './client'
import type { ExplainResponse } from '@/types/api'

export const explainAPI = {
  /**
   * Get full explainability data for a single order
   */
  async getExplain(orderId: string): Promise<ExplainResponse> {
    return apiClient.get<ExplainResponse>(`/explain/${orderId}`)
  },
}

/**
 * System Health API Endpoints
 */

import { apiClient } from './client'
import type {
  SystemHealthResponse,
} from '@/types/api'

export const systemAPI = {
  /**
   * Get full system health snapshot with all sections
   */
  async getHealth(): Promise<SystemHealthResponse> {
    return apiClient.get<SystemHealthResponse>('/system/health')
  },
}

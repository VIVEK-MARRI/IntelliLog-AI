import { apiClient } from './client'
import { CopilotResponse, WorkspaceResponse } from '@/types/copilot'

export const copilotAPI = {
  async query(query: string, context: any = {}, signal?: AbortSignal) {
    return apiClient.post<CopilotResponse>('/copilot/query', { query, context }, { signal })
  },

  async getRecommendations(): Promise<CopilotResponse> {
    return apiClient.post<CopilotResponse>('/copilot/recommendations', {})
  },

  async workspaceQuery(query: string, signal?: AbortSignal): Promise<WorkspaceResponse> {
    return apiClient.post<WorkspaceResponse>('/copilot/workspace', { query }, { signal })
  },
}

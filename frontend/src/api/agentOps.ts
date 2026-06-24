import type { AgentOpsResponse } from '@/types/api'
import { apiClient } from './client'

export const agentOpsAPI = {
  getAgentOps: (): Promise<AgentOpsResponse> =>
    apiClient.get<AgentOpsResponse>('/agent-ops'),
}
import { apiClient } from './client'
import { RiskFactor } from '@/types/api'

export interface AgentDecisionResponse {
  decisionId: string
  orderId: string
  decisionType: 'no_action' | 'alert' | 'reroute'
  reasoning: string
  riskScore: number
  topRiskFactors: RiskFactor[]
  toolsInvoked: string[]
  outcome: string
  timestamp: string
  latencyMs: number
  impact?: {
    time_saved_minutes?: number
    risk_reduction?: number
  }
}

export interface AgentDecisionHistoryResponse {
  orderId: string
  decisions: AgentDecisionResponse[]
  latestDecision: AgentDecisionResponse | null
}

export const agentAPI = {
  async getOrderDecisions(orderId: string): Promise<AgentDecisionHistoryResponse> {
    return apiClient.get<AgentDecisionHistoryResponse>(`/agent/decisions/${orderId}`)
  },

  async getDecisionDetail(orderId: string, decisionId: string): Promise<AgentDecisionResponse> {
    return apiClient.get<AgentDecisionResponse>(`/agent/decisions/${orderId}/${decisionId}`)
  },
}

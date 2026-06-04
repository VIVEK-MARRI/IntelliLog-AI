/**
 * Predictions & ML API Endpoints
 */

import { apiClient } from './client'
import { PredictionResponse, Recommendation } from '@/types/api'

export const predictionsAPI = {
  /**
   * Get risk prediction for an order
   * Returns SHAP explanations with risk factors
   */
  async getPrediction(orderId: string): Promise<PredictionResponse> {
    return apiClient.get<PredictionResponse>(`/predictions/${orderId}`)
  },

  /**
   * Get risk history for an order (last N predictions)
   */
  async getRiskHistory(
    orderId: string,
    limit: number = 20
  ): Promise<{ predictions: PredictionResponse[]; sparkline: number[] }> {
    return apiClient.get(`/predictions/${orderId}/history`, { params: { limit } })
  },

  /**
   * Get batch predictions for multiple orders
   */
  async getBatchPredictions(orderIds: string[]): Promise<Record<string, PredictionResponse>> {
    return apiClient.post('/predictions/batch', { order_ids: orderIds })
  },

  /**
   * Get feature importance for model
   */
  async getFeatureImportance(): Promise<any> {
    return apiClient.get('/predictions/model/feature-importance')
  },

  /**
   * Get model metadata
   */
  async getModelInfo(): Promise<{
    version: string
    f1_score: number
    accuracy: number
    latency_ms: number
    last_updated: string
  }> {
    return apiClient.get('/predictions/model/info')
  },

  /**
   * Get recommendations based on operational analysis
   */
  async getRecommendations(): Promise<Recommendation[]> {
    return apiClient.get<Recommendation[]>('/insights/recommendations')
  },

  /**
   * Get operational metrics summary
   */
  async getOperationalMetrics(): Promise<{
    orders_processed: number
    active_deliveries: number
    high_risk_deliveries: number
    average_delay_minutes: number
    agent_interventions: number
    on_time_percentage: number
  }> {
    return apiClient.get('/insights/metrics')
  },

  /**
   * Get delay cause analysis
   */
  async getDelayCauses(): Promise<{
    causes: Array<{
      cause: string
      percentage: number
      affected_orders: number
      trend: 'up' | 'down' | 'stable'
    }>
  }> {
    return apiClient.get('/insights/delay-causes')
  },

  /**
   * Get fleet health score
   */
  async getFleetHealth(): Promise<{
    score: number
    status: 'excellent' | 'healthy' | 'warning' | 'critical'
    on_time_rate: number
    delay_frequency: number
    risk_distribution: number
    route_efficiency: number
    intervention_frequency: number
    trend: number
  }> {
    return apiClient.get('/insights/fleet-health')
  },
}

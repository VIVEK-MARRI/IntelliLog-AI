/**
 * Copilot Types — AI Assistant Data Structures
 * Extended for LLM-powered intelligence with evidence, streaming, and operational grounding.
 */

export interface CopilotMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  response?: CopilotResponse;
  streaming?: boolean;
}

export interface CopilotResponse {
  summary: string;
  evidence: string[];
  recommendations: string[];
  confidence: number;
  sources: string[];
  intent?: string;
  related_order_ids?: string[];
  related_driver_ids?: string[];
  affected_orders?: string[];
  affected_drivers?: string[];
  risk_drivers?: RiskDriver[];
  shap_factors?: ShapFactor[];
  metadata?: Record<string, unknown>;
}

export interface RiskDriver {
  factor: string;
  impact: 'high' | 'medium' | 'low';
  description?: string;
}

export interface ShapFactor {
  feature: string;
  contribution: number;
}

export interface ConversationContext {
  totalOrders: number;
  delayedOrders: number;
  highRiskOrders: number;
  averageDelay: number;
  fleetEfficiency: number;
  onTimeRate: number;
  riskRate: number;
}

export interface CopilotIntent {
  type:
    | 'delay_analysis'
    | 'risk_analysis'
    | 'route_analysis'
    | 'driver_performance'
    | 'operational_report'
    | 'prediction'
    | 'general_help'
    | 'unknown';
  confidence: number;
  entities: Record<string, string>;
}

export type CopilotStage = 'idle' | 'connecting' | 'thinking' | 'gathering_context' | 'streaming' | 'complete' | 'error';

export interface CopilotStreamMessage {
  type: 'status' | 'copilot_response' | 'error' | 'close';
  stage?: CopilotStage;
  content?: string | CopilotResponse;
}

export interface CopilotStreamState {
  stage: CopilotStage;
  stageContent: string;
  streamedContent: string;
  response: CopilotResponse | null;
  error: string | null;
  isConnected: boolean;
}

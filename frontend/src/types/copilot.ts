/**
 * Copilot Types — AI Assistant Data Structures
 * Extended for LLM-powered intelligence with evidence, streaming, and operational grounding.
 */

export interface EntityReference {
  id: string
  type: 'order' | 'driver'
  exists: boolean
}

export interface ValidatedEvidence {
  text: string
  entities: EntityReference[]
  status: 'validated' | 'unverified' | 'mixed'
}

export interface CopilotMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  response?: CopilotResponse;
  validatedEvidence?: ValidatedEvidence[];
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

export type CopilotStage = 'idle' | 'connecting' | 'reconnecting' | 'thinking' | 'gathering_context' | 'streaming' | 'complete' | 'error' | 'cancelled';

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

// ─── Workspace Copilot ────────────────────────────────────────────────────

export interface WorkspaceSupportingOrder {
  order_id: string
  driver_name: string
  status: string
  risk_score: number
  delay_minutes: number
  eta?: string
  driver_id?: string
}

export interface WorkspaceSupportingPrediction {
  order_id: string
  risk_score: number
  confidence: number
  predicted_delay_minutes: number
  top_factors: string[]
  model_version: string
}

export interface WorkspaceSupportingDecision {
  decision_id: string
  order_id: string
  decision_type: string
  outcome: string
  reasoning: string
  risk_score: number
  timestamp: string
}

export interface WorkspaceRecommendedAction {
  id: string
  type: 'open_order' | 'explain' | 'view_route' | 'create_alert' | 'generate_report'
  label: string
  description?: string
  params: Record<string, string>
  priority: 'critical' | 'high' | 'normal'
}

export interface WorkspaceMessage {
  id: string
  query: string
  timestamp: Date
  response: WorkspaceResponse | null
  error?: string
  loading: boolean
}

export interface WorkspaceResponse {
  summary: string
  evidence: string[]
  confidence: number
  sources: string[]
  intent: string
  supporting_orders: WorkspaceSupportingOrder[]
  supporting_predictions: WorkspaceSupportingPrediction[]
  supporting_decisions: WorkspaceSupportingDecision[]
  recommended_actions: WorkspaceRecommendedAction[]
  related_order_ids: string[]
}

/**
 * Application-wide constants
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || '/api/v1',
  WS_URL: import.meta.env.VITE_WS_URL || '/ws',
  COPILOT_WS_URL: import.meta.env.VITE_COPILOT_WS_URL || '/api/v1/copilot/ws',
  REQUEST_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // ms
} as const;

// React Query Configuration
export const REACT_QUERY_CONFIG = {
  STALE_TIME: 30000, // 30 seconds
  GC_TIME: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
  RETRY_ATTEMPTS: 2,
  REFETCH_INTERVAL: 60000, // 1 minute
} as const;

// Map Configuration
export const MAP_CONFIG = {
  DEFAULT_CENTER: [40.7128, -74.006] as [number, number], // NYC
  DEFAULT_ZOOM: 10,
  MIN_ZOOM: 2,
  MAX_ZOOM: 18,
  TILE_LAYER: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  CLUSTER_THRESHOLD_KM: 1,
  AUTO_FIT_PADDING: 0.15,
} as const;

// Risk Thresholds
export const RISK_CONFIG = {
  LOW_THRESHOLD: 30,
  MEDIUM_THRESHOLD: 70,
  HIGH_ALERT_THRESHOLD: 85,
  REROUTE_THRESHOLD: 75,
  DELAY_WARNING_MINUTES: 15,
} as const;

// Performance Configuration
export const PERFORMANCE_CONFIG = {
  VIRTUALIZATION_ITEM_HEIGHT: 60, // pixels
  TABLE_PAGE_SIZE: 50,
  MAX_CONCURRENT_UPDATES: 10,
  DEBOUNCE_DELAY: 300, // ms
  THROTTLE_DELAY: 1000, // ms
} as const;

// Toast Configuration
export const TOAST_CONFIG = {
  DEFAULT_DURATION: 5000, // ms
  SUCCESS_DURATION: 3000,
  ERROR_DURATION: 6000,
  POSITION: 'bottom-right',
  MAX_TOASTS: 5,
} as const;

// Date & Time Format
export const DATE_FORMAT = {
  DISPLAY_DATE: 'MMM d, yyyy',
  DISPLAY_TIME: 'HH:mm:ss',
  DISPLAY_DATETIME: 'MMM d, yyyy HH:mm',
  ISO_FORMAT: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
  API_FORMAT: 'yyyy-MM-dd',
} as const;

// Feature Flags
export const FEATURES = {
  ENABLE_COPILOT: true,
  ENABLE_EXECUTIVE_MODE: true,
  ENABLE_ACCESSIBILITY: true,
  ENABLE_PERFORMANCE_MONITORING: true,
  ENABLE_ANALYTICS: true,
} as const;

// Order Statuses
export const ORDER_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ASSIGNED: 'assigned',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

// Alert Types
export const ALERT_TYPES = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
} as const;

// Keyboard Shortcuts
export const KEYBOARD_SHORTCUTS = {
  OPEN_SEARCH: 'Ctrl+K',
  CLOSE_MODAL: 'Escape',
  SUBMIT_FORM: 'Ctrl+Enter',
  NAVIGATE_PREVIOUS: 'ArrowUp',
  NAVIGATE_NEXT: 'ArrowDown',
} as const;

// Animation Durations (ms)
export const ANIMATION_DURATIONS = {
  FADE: 200,
  SLIDE: 300,
  SCALE: 250,
  BOUNCE: 400,
} as const;

// Color Palette
export const COLORS = {
  SUCCESS: '#4ade80',
  ERROR: '#f87171',
  WARNING: '#facc15',
  INFO: '#60a5fa',
  CRITICAL: '#ef4444',
  NEUTRAL: '#94a3b8',
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'intelliglog_auth_token',
  USER_PREFERENCES: 'intelliglog_user_prefs',
  DASHBOARD_STATE: 'intelliglog_dashboard_state',
  MAP_STATE: 'intelliglog_map_state',
  SELECTED_ORDER: 'intelliglog_selected_order',
} as const;

// WebSocket Event Types
export const WS_EVENTS = {
  ORDER_UPDATED: 'order_updated',
  ORDER_CREATED: 'order_created',
  POSITION_UPDATED: 'position_updated',
  AGENT_DECISION: 'agent_decision',
  ROUTE_UPDATED: 'route_updated',
  ETA_UPDATED: 'eta_updated',
  ALERT: 'alert',
  CONNECTION_RESTORED: 'connection_restored',
  METRICS_UPDATED: 'metrics_updated',
} as const;

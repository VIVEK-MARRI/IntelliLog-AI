import type { Page, Locator } from '@playwright/test'

export function byTestId(testId: string): string {
  return `[data-testid="${testId}"]`
}

export const selectors = {
  // App-level
  appRoot: (page: Page) => page.locator('#root, main, body'),

  // Fleet map
  fleetMap: () => '#fleet-map',
  leafletContainer: () => '.leaflet-container',
  leafletZoomIn: () => '.leaflet-control-zoom-in',
  leafletMarkerPaths: () => 'path.leaflet-interactive',
  leafletPopup: () => '.leaflet-popup-content',

  // Vehicle/details panel (existing tests rely on class contains)
  vehicleDetails: () => '[class*="VehicleDetails"], [data-testid*="vehicle-details"], [aria-label*="Vehicle"]',

  // Orders
  ordersPageTitle: () => pageLikeText(/orders/i),

  // Copilot / AI
  copilotButton: () => 'button:has-text(/copilot|command center|ai assistant/i)',
  copilotInput: () => 'textarea[placeholder*="Ask"], textarea[placeholder*="ask about"], input[placeholder*="Ask"], textarea',
  confidenceHeading: () => /confidence/i,
  evidenceHeading: () => /evidence/i,
  recommendationHeading: () => /recommendation/i,

  // System health
  systemHealth: () => pageLikeText(/system health/i),
  apiHealth: () => pageLikeText(/api/i),
  websocketHealth: () => pageLikeText(/websocket|ws/i),
  dbHealth: () => pageLikeText(/postgres|postgresql|db/i),
  modelHealth: () => pageLikeText(/model/i),

  // Executive
  executive: () => pageLikeText(/executive/i),
}

function pageLikeText(re: RegExp) {
  // used with locator.getByText in tests via page.getByText(re)
  return `text=${re.source}`
}

// Helpers to avoid brittle text queries:
export function hasText(locator: Locator, re: RegExp): Promise<boolean> {
  return locator.filter({ hasText: re }).count().then((c) => c > 0)
}

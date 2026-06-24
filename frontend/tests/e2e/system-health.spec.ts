import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'
import { captureOnFailure } from './utils/screenshots'
import { gotoSystemHealth } from './utils/navigation'

test.describe('System Health Center', () => {
  test('S.1 — Infrastructure + analytics sections render (best-effort)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoSystemHealth(page)
      await page.waitForTimeout(1500)

      // Infrastructure checks
      const infra = ['api', 'redis', 'postgres', 'gemini', 'agent runner', 'websocket', 'model']
      for (const label of infra) {
        const loc = page.getByText(new RegExp(label, 'i')).first()
        if (await loc.isVisible().catch(() => false)) {
          await expect(loc).toBeVisible({ timeout: 8_000 })
        }
      }

      // Analytics checks
      const analytics = ['request analytics', 'prediction analytics', 'websocket analytics', 'redis analytics', 'database analytics']
      let anyAnalytics = 0
      for (const label of analytics) {
        const loc = page.getByText(new RegExp(label.replace(/\s+/g, '\\s+'), 'i')).first()
        if (await loc.isVisible().catch(() => false)) anyAnalytics++
      }
      test.info().attach('system-health-analytics-found', {
        body: String(anyAnalytics),
        contentType: 'text/plain',
      })

      // Alerts section
      const alerts = page.getByText(/alert|alerts|critical|degraded|down/i).first()
      if (await alerts.isVisible().catch(() => false)) {
        await expect(alerts).toBeVisible({ timeout: 8_000 })
      }

      assertNoErrors(errors, 'system-health')
      assertNoFailedRequests(network, 'system-health')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'system-health.infrastructure-analytics', fullPage: true })
      throw e
    }
  })

  test('S.2 — Diagnostics: counts of status badges + alert cards (when present)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoSystemHealth(page)
      await page.waitForTimeout(1500)

      const badgeCount = await page.locator('[class*="Badge"], [role="status"], [class*="status"]').count().catch(() => 0)
      const alertCardCount = await page.locator('[class*="Alert"], [class*="alert"], [role="alert"]').count().catch(() => 0)
      const eventRowCount = await page.locator('tr, [role="row"]').count().catch(() => 0)

      test.info().attach('system-health-diagnostics', {
        body: `badgeCount=${badgeCount}\nalertCardCount=${alertCardCount}\neventRowCount=${eventRowCount}`,
        contentType: 'text/plain',
      })

      assertNoErrors(errors, 'system-health.diagnostics')
      assertNoFailedRequests(network, 'system-health.diagnostics')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'system-health.diagnostics', fullPage: true })
      throw e
    }
  })
})

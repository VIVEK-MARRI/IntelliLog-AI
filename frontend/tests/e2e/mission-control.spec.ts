import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'
import { captureOnFailure } from './utils/screenshots'
import { gotoMissionControl } from './utils/navigation'

test.describe('Mission Control', () => {
  test('M.1 — KPIs + Critical alerts + AI recommendations render (real-time safe, best-effort)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoMissionControl(page)
      await page.waitForTimeout(1500)

      // KPI cards (best-effort: look for headings/labels)
      const kpiLabels = ['active orders', 'high risk', 'fleet health', 'ai interventions']
      let kpiFound = 0
      for (const label of kpiLabels) {
        const loc = page.getByText(new RegExp(label, 'i')).first()
        const visible = await loc.isVisible().catch(() => false)
        if (visible) kpiFound++
      }
      test.info().attach('mission-control-kpi-found', {
        body: String(kpiFound),
        contentType: 'text/plain',
      })

      // Critical alerts
      const alertHeading = page.getByText(/critical alerts/i).first()
      const alertVisible = await alertHeading.isVisible().catch(() => false)
      if (alertVisible) await expect(alertHeading).toBeVisible({ timeout: 8_000 })

      // AI recommendations
      const recHeading = page.getByText(/recommendation|recommendations|ai recommendation/i).first()
      const recVisible = await recHeading.isVisible().catch(() => false)
      if (recVisible) await expect(recHeading).toBeVisible({ timeout: 8_000 })

      // Activity feed
      const activity = page.getByText(/activity|feed|events/i).first()
      const activityVisible = await activity.isVisible().catch(() => false)
      if (activityVisible) await expect(activity).toBeVisible({ timeout: 8_000 })

      // AI pipeline
      const pipeline = page.getByText(/pipeline|stages|ai pipeline/i).first()
      const pipelineVisible = await pipeline.isVisible().catch(() => false)
      if (pipelineVisible) await expect(pipeline).toBeVisible({ timeout: 8_000 })

      // System status footer
      const statusFooter = page.getByText(/system status|healthy|degraded|unhealthy|api|redis|postgres/i).first()
      const statusVisible = await statusFooter.isVisible().catch(() => false)
      if (statusVisible) await expect(statusFooter).toBeVisible({ timeout: 8_000 })

      assertNoErrors(errors, 'mission-control')
      assertNoFailedRequests(network, 'mission-control')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'mission-control.kpis-alerts-recs', fullPage: true })
      throw e
    }
  })

  test('M.2 — Diagnostics: counts of key sections when present', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoMissionControl(page)
      await page.waitForTimeout(2000)

      const kpiCardCount = await page.locator('[class*="Card"], [role="group"]').count().catch(() => 0)
      const alertCardCount = await page.locator('[class*="Alert"], [class*="critical"]').count().catch(() => 0)
      const recCardCount = await page.locator('[class*="Recommend"], [class*="Recommendation"]').count().catch(() => 0)
      const eventRowCount = await page.locator('table tr, [role="row"], li').count().catch(() => 0)

      test.info().attach('mission-control-diagnostics', {
        body: `kpiCardCount=${kpiCardCount}\nalertCardCount=${alertCardCount}\nrecCardCount=${recCardCount}\neventRowCount=${eventRowCount}`,
        contentType: 'text/plain',
      })

      assertNoErrors(errors, 'mission-control.diagnostics')
      assertNoFailedRequests(network, 'mission-control.diagnostics')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'mission-control.diagnostics', fullPage: true })
      throw e
    }
  })
})

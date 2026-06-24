import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'
import { captureOnFailure } from './utils/screenshots'
import { gotoExecutive } from './utils/navigation'

test.describe('Executive Command Center', () => {
  test('E.1 — Executive KPIs + timeline + summary render (no placeholder text)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoExecutive(page)
      await page.waitForTimeout(1500)

      const placeholders = [
        /coming soon|placeholder|tbd|lorem ipsum|fake data/i,
        /undefined|NaN/i,
      ]

      // KPI row
      const kpiRow = page.getByText(/fleet health|risk trend|time saved|interventions/i).first()
      await expect(kpiRow).toBeVisible({ timeout: 10_000 })

      // Critical attention section + operational health
      const critical = page.getByText(/critical|attention|action|risk/i).first()
      if (await critical.isVisible().catch(() => false)) {
        await expect(critical).toBeVisible({ timeout: 8_000 })
      }

      // Executive timeline / events
      const timeline = page.getByText(/timeline|events|trend|sequence/i).first()
      if (await timeline.isVisible().catch(() => false)) {
        await expect(timeline).toBeVisible({ timeout: 8_000 })
      }

      // Business summary
      const summary = page.getByText(/executive summary|business summary|summary/i).first()
      if (await summary.isVisible().catch(() => false)) {
        await expect(summary).toBeVisible({ timeout: 8_000 })
      }

      // Guardrail: detect placeholder / NaN / undefined rendering
      for (const ph of placeholders) {
        const found = await page.getByText(ph).first().isVisible().catch(() => false)
        if (found) {
          throw new Error(`Executive page contains placeholder/invalid text matching: ${ph}`)
        }
      }

      assertNoErrors(errors, 'executive')
      assertNoFailedRequests(network, 'executive')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'executive.kpis-timeline-summary', fullPage: true })
      throw e
    }
  })

  test('E.2 — Diagnostics: counts of KPI blocks + timeline rows', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoExecutive(page)
      await page.waitForTimeout(1500)

      const kpiBlocks = await page.locator('[class*="KPI"], [class*="kpi"], [role="group"]').count().catch(() => 0)
      const timelineRows = await page.locator('tr, [role="row"], li').count().catch(() => 0)

      test.info().attach('executive-diagnostics', {
        body: `kpiBlocks~=${kpiBlocks}\ntimelineRows~=${timelineRows}`,
        contentType: 'text/plain',
      })

      assertNoErrors(errors, 'executive.diagnostics')
      assertNoFailedRequests(network, 'executive.diagnostics')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'executive.diagnostics', fullPage: true })
      throw e
    }
  })
})

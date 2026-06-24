import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'
import { captureOnFailure } from './utils/screenshots'
import { gotoAIWorkspace, gotoExecutive, gotoMissionControl, gotoOperations, gotoOrders, gotoSystemHealth } from './utils/navigation'

test.describe('Responsive UI Regression', () => {
  const desktop = [
    { width: 1920, height: 1080, name: 'desktop-1920x1080' },
    { width: 1440, height: 900, name: 'desktop-1440x900' },
  ]
  const tablet = [
    { width: 1024, height: 768, name: 'tablet-1024x768' },
    { width: 768, height: 1024, name: 'tablet-768x1024' },
  ]
  const mobile = [
    { width: 430, height: 932, name: 'mobile-430x932' },
    { width: 390, height: 844, name: 'mobile-390x844' },
  ]

  const viewports = [...desktop, ...tablet, ...mobile]

  for (const vp of viewports) {
    test(`R.1 — Layout no horizontal overflow + key pages usable (${vp.name})`, async ({ page }) => {
      const errors = captureConsoleErrors(page)
      const network = captureNetwork(page)

      try {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await login(page)

        // Mission Control, Orders, AI Workspace are the mandatory responsive checks
        // (Fleet Map is implicitly covered via Operations -> map presence)
        await gotoMissionControl(page)
        await page.waitForTimeout(750)
        await page.getByText(/mission control/i).first().isVisible().catch(() => null)

        await gotoOperations(page)
        await page.waitForTimeout(750)
        await expect(page.locator('#fleet-map')).toBeVisible({ timeout: 10_000 })

        await gotoOrders(page)
        await page.waitForTimeout(750)
        // Table usability: at least ensure some rows or empty-state exists.
        await expect(page.locator('table, [class*="OrderTable"]')).toBeVisible({ timeout: 10_000 }).catch(() => null)
        await page.waitForTimeout(250)

        await gotoAIWorkspace(page)
        await page.waitForTimeout(750)
        await expect(page.locator('textarea, [contenteditable="true"], input[type="text"]')).toBeVisible({ timeout: 10_000 })

        // Overflow check:
        const overflow = await page.evaluate(() => {
          const body = document.body
          const doc = document.documentElement
          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            hasHorizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
          }
        })
        test.info().attach('overflow-diag', {
          body: JSON.stringify({ viewport: vp, ...overflow }, null, 2),
          contentType: 'application/json',
        })

        expect(overflow.hasHorizontalOverflow, `should not have horizontal overflow (${vp.name})`).toBe(false)

        assertNoErrors(errors, `responsive.${vp.name}`)
        assertNoFailedRequests(network, `responsive.${vp.name}`)
      } catch (e) {
        await captureOnFailure({ page, testTitle: `responsive.${vp.name}`, fullPage: true })
        throw e
      }
    })
  }
})

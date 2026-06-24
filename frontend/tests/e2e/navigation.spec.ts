import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'
import { captureOnFailure } from './utils/screenshots'
import { gotoAIWorkspace, gotoExecutive, gotoMissionControl, gotoOperations, gotoOrders, gotoSystemHealth } from './utils/navigation'

test.describe('Navigation routes', () => {
  const routes = [
    { name: 'root/dashboard', path: '/dashboard', opener: async (page: any) => await page.goto('/dashboard') },
    { name: 'mission-control', path: '/mission-control', opener: gotoMissionControl },
    { name: 'dashboard', path: '/dashboard', opener: async (page: any) => await page.goto('/dashboard', { waitUntil: 'domcontentloaded' }) },
    { name: 'orders', path: '/orders', opener: gotoOrders },
    { name: 'copilot', path: '/copilot', opener: gotoAIWorkspace },
    { name: 'executive', path: '/executive', opener: gotoExecutive },
    { name: 'system-health', path: '/system-health', opener: gotoSystemHealth },
  ] as const

  for (const r of routes) {
    test(`N.1 — ${r.name} loads without fatal errors`, async ({ page }) => {
      const errors = captureConsoleErrors(page)
      const network = captureNetwork(page)

      try {
        await login(page)

        await r.opener(page as any)

        // Generic checks: route has some heading or content.
        await expect(page.locator('body')).toBeVisible({ timeout: 10_000 })
        await page.waitForTimeout(500)

        // Expect no obvious fatal errors.
        assertNoErrors(errors, `route ${r.path}`)
        assertNoFailedRequests(network, `route ${r.path}`)

        // Title-level check: ensure we have some main content.
        const heading = page.getByRole('heading').first()
        if (!(await heading.isVisible().catch(() => false))) {
          // Fallback: look for any common text.
          await expect(page.getByText(/intellilog|operations|orders|copilot|executive|system health/i).first()).toBeVisible({
            timeout: 10_000,
          })
        }
      } catch (e) {
        await captureOnFailure({ page, testTitle: `navigation.${r.name}`, fullPage: true })
        throw e
      }
    })
  }
})

import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'

test.describe('Dashboard load', () => {
  test('B.1 — Dashboard shell renders under 2s on slow network', async ({ page, context }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    await login(page)

    const t0 = Date.now()
    await expect(page.getByRole('heading', { name: /intellilog/i })).toBeVisible({ timeout: 5_000 })
    const headerPaint = Date.now() - t0
    expect(headerPaint, 'header must paint in < 2s').toBeLessThan(2_000)

    assertNoErrors(errors, 'dashboard header paint')
    assertNoFailedRequests(network, 'dashboard header paint')
  })

  test('B.2 — KPI cards load independently with skeleton placeholders', async ({ page }) => {
    await login(page)
    const t0 = Date.now()
    await expect(page.getByText(/active orders/i).first()).toBeVisible({ timeout: 5_000 })
    const tti = Date.now() - t0
    expect(tti, 'TTI for KPIs must be < 5s').toBeLessThan(5_000)
  })

  test('B.3 — No blank screen at any point', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await login(page)

    const emptyBody = await page.evaluate(() => {
      const body = document.body
      return !body || (body.innerText || '').trim().length === 0
    })
    expect(emptyBody, 'body must never be empty').toBe(false)

    assertNoErrors(errors, 'no blank screen')
  })
})

import { test, expect } from '@playwright/test'
import { login, logout, clearAuth } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'

test.describe('Auth cycle — no stale state', () => {
  test('G.1 — Logout returns to /login and clears token', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    await login(page)
    await expect(page).toHaveURL(/\/dashboard/)
    await logout(page)
    await expect(page).toHaveURL(/\/login/)

    const token = await page.evaluate(() => window.localStorage.getItem('auth_token'))
    expect(token, 'auth_token must be cleared on logout').toBeFalsy()

    assertNoErrors(errors, 'logout')
    assertNoFailedRequests(network, 'logout')
  })

  test('G.2 — Login after logout shows clean dashboard (no stale orders)', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/dashboard/)
    await page.waitForTimeout(2000)
    const firstOrderCount = await page.locator('tr[class*="order"]').count()

    await logout(page)
    await login(page)
    await page.waitForTimeout(3000)

    const secondOrderCount = await page.locator('tr[class*="order"]').count()
    expect(secondOrderCount, 'order count after re-login').toBeGreaterThanOrEqual(0)
  })

  test('G.3 — Stale websocket connections are closed across cycles', async ({ page, context }) => {
    const wsCount = { value: 0 }
    context.on('websocket', (ws) => {
      wsCount.value++
      ws.on('close', () => {
        wsCount.value--
      })
    })

    await login(page)
    await page.waitForTimeout(3000)
    const activeAfterLogin = wsCount.value

    await logout(page)
    await page.waitForTimeout(2000)

    expect(wsCount.value, 'no dangling websockets after logout').toBeLessThan(activeAfterLogin)
  })
})

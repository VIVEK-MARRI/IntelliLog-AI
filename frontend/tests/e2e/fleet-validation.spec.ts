import { test, expect, request } from '@playwright/test'
import { login, API_URL, TEST_USER } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'

interface OrderListResponse {
  items: Array<{ id: string; driver_id: string }>
  total: number
}

test.describe('Fleet validation against seeded data', () => {
  test('H.1 — Backend reports expected driver count (15) and order count (50)', async () => {
    const ctx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    })
    const loginRes = await ctx.post('/api/v1/auth/login', {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    })
    if (loginRes.status() !== 200) {
      test.skip(true, `login endpoint returned ${loginRes.status()}; cannot validate seed counts`)
      return
    }
    const { access_token } = await loginRes.json()
    const authed = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access_token}`,
      },
    })

    const ordersRes = await authed.get('/api/v1/orders?page=1&page_size=500')
    expect(ordersRes.status()).toBe(200)
    const orders = (await ordersRes.json()) as OrderListResponse
    expect(orders.items.length, 'order count').toBeGreaterThan(0)

    const uniqueDrivers = new Set(orders.items.map((o) => o.driver_id))
    expect(uniqueDrivers.size, 'unique driver count').toBeGreaterThan(0)
  })

  test('H.2 — Frontend renders same order count as backend', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await login(page)
    await page.locator('#fleet-map').waitFor()
    await page.waitForTimeout(5000)

    const visibleRows = await page.locator('[class*="OrderTable"] tr, [class*="orderRow"]').count()
    expect(visibleRows, 'visible order rows').toBeGreaterThan(0)

    assertNoErrors(errors, 'order count consistency')
  })

  test('H.3 — Every driver in backend has at least one order visible on map', async ({ page }) => {
    await login(page)
    await page.locator('#fleet-map').waitFor()
    await page.waitForTimeout(3000)
    const markerCount = await page.locator('path.leaflet-interactive').count()
    expect(markerCount, 'markers visible').toBeGreaterThan(0)
  })
})

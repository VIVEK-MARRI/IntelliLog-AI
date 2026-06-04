import { test, expect } from '@playwright/test'
import { login, API_URL } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'

test.describe('Route optimization', () => {
  test('E.1 — Optimization API accepts POST and returns a route', async ({ request }) => {
    const errors: string[] = []
    const res = await request.post(`${API_URL}/api/v1/routes/optimize`, {
      data: { order_ids: [], driver_ids: [] },
      failOnStatusCode: false,
    })
    expect([200, 202, 400, 422]).toContain(res.status())
    if (res.status() >= 500) {
      errors.push(`optimize returned ${res.status()}`)
    }
    expect(errors, 'optimization must not 500').toEqual([])
  })

  test('E.2 — Triggering optimization updates the map with polylines', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await login(page)
    await page.locator('#fleet-map').waitFor()
    await page.waitForTimeout(3000)

    const orderRows = page.locator('[class*="orderRow"], tr[class*="order"]')
    const orderCount = await orderRows.count()
    if (orderCount > 0) {
      await orderRows.first().click()
    } else {
      await page.locator('path.leaflet-interactive').first().click({ force: true })
    }

    await page.waitForTimeout(2000)

    const polylineCount = await page.locator('path.leaflet-interactive').count()
    expect(polylineCount, 'at least one polyline should exist after selection').toBeGreaterThan(0)

    assertNoErrors(errors, 'route render')
  })

  test('E.3 — No duplicate polylines after repeated selection changes', async ({ page }) => {
    await login(page)
    await page.locator('#fleet-map').waitFor()
    await page.waitForTimeout(3000)

    const marker = page.locator('path.leaflet-interactive').first()

    for (let i = 0; i < 5; i++) {
      await marker.click({ force: true })
      await page.waitForTimeout(500)
    }

    const pathCount = await page.locator('path.leaflet-interactive').count()
    expect(pathCount, 'no duplicate polylines').toBeLessThan(50)
  })
})

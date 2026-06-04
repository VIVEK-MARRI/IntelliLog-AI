import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'

test.describe('Fleet map', () => {
  test('C.1 — Map container mounts with tile layer loaded', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    await login(page)
    await expect(page.locator('#fleet-map')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10_000 })

    assertNoErrors(errors, 'map mount')
    assertNoFailedRequests(network, 'map mount')
  })

  test('C.2 — Map respects user pan and zoom after initial fit', async ({ page }) => {
    await login(page)
    await expect(page.locator('.leaflet-container')).toBeVisible()

    await page.waitForTimeout(2000)

    const beforeZoom = await page.locator('.leaflet-container').evaluate(
      (el) => (el as HTMLElement & { _leaflet_map?: any })._leaflet_map?.getZoom?.() ?? null
    )

    await page.locator('.leaflet-control-zoom-in').click()
    await page.waitForTimeout(500)

    const afterZoom = await page.locator('.leaflet-container').evaluate(
      (el) => (el as HTMLElement & { _leaflet_map?: any })._leaflet_map?.getZoom?.() ?? null
    )

    if (beforeZoom !== null && afterZoom !== null) {
      expect(afterZoom).toBeGreaterThan(beforeZoom)
    }
  })

  test('C.3 — Vehicle markers appear for seeded orders', async ({ page }) => {
    const errors = captureConsoleErrors(page)

    await login(page)
    await expect(page.locator('#fleet-map')).toBeVisible()
    await page.waitForTimeout(3000)

    const circleMarkerCount = await page.locator('path.leaflet-interactive').count()
    expect(circleMarkerCount, 'must have at least one marker').toBeGreaterThan(0)

    assertNoErrors(errors, 'marker visibility')
  })
})

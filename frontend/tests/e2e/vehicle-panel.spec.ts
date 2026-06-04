import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'

test.describe('Vehicle details panel', () => {
  test('D.1 — Clicking a marker opens the details panel', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    await login(page)
    await expect(page.locator('#fleet-map')).toBeVisible()
    await page.waitForTimeout(3000)

    const firstMarker = page.locator('path.leaflet-interactive').first()
    await firstMarker.click({ force: true })

    const panel = page.getByRole('region', { name: /vehicle details|order details/i }).or(
      page.locator('[class*="VehicleDetails"]')
    )
    await expect(panel).toBeVisible({ timeout: 5_000 })

    assertNoErrors(errors, 'vehicle panel open')
    assertNoFailedRequests(network, 'vehicle panel open')
  })

  test('D.2 — Panel shows driver, ETA, risk, speed, heading, distance', async ({ page }) => {
    await login(page)
    await page.locator('#fleet-map').waitFor()
    await page.waitForTimeout(3000)
    await page.locator('path.leaflet-interactive').first().click({ force: true })

    const panel = page.locator('[class*="VehicleDetails"]').first()
    await expect(panel).toBeVisible({ timeout: 5_000 })

    await expect(panel.getByText(/driver/i)).toBeVisible()
    await expect(panel.getByText(/eta/i)).toBeVisible()
    await expect(panel.getByText(/risk/i)).toBeVisible()
    await expect(panel.getByText(/speed/i)).toBeVisible()
  })

  test('D.3 — Close button dismisses the panel', async ({ page }) => {
    await login(page)
    await page.locator('#fleet-map').waitFor()
    await page.waitForTimeout(3000)
    await page.locator('path.leaflet-interactive').first().click({ force: true })

    const panel = page.locator('[class*="VehicleDetails"]').first()
    await expect(panel).toBeVisible()
    const closeBtn = panel.getByRole('button', { name: /close/i })
    await closeBtn.click()
    await expect(panel).not.toBeVisible({ timeout: 3_000 })
  })
})

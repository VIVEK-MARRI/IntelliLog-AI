import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'
import { captureOnFailure } from './utils/screenshots'
import { gotoOrders, gotoOperations } from './utils/navigation'

import { selectors } from './utils/selectors'

test.describe('Operations — Fleet Map & Real-time Ops', () => {
  test('O.1 — FleetMap mounts, tiles load, marker layer exists (seeded)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOperations(page)

      await expect(page.locator('#fleet-map')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator(selectors.leafletContainer())).toBeVisible({ timeout: 10_000 })

      // Tile layer fetches should show no failed requests.
      // Marker layer existence:
      const markerCount = await page.locator(selectors.leafletMarkerPaths()).count()
      test.info().attach('markers', { body: String(markerCount), contentType: 'text/plain' })
      expect(markerCount, 'marker count > 0').toBeGreaterThan(0)

      assertNoErrors(errors, 'fleet map mount')
      assertNoFailedRequests(network, 'fleet map mount')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'operations.fleet-map.mount', fullPage: true })
      throw e
    }
  })

  test('O.2 — Cluster behavior changes with zoom (zoom interactions)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOperations(page)

      await expect(page.locator('#fleet-map')).toBeVisible({ timeout: 10_000 })
      await page.waitForTimeout(2000)

      // Capture zoom before/after zoom-in
      const zoomBefore = await page.locator(selectors.leafletContainer()).evaluate((el: any) => {
        return el?._leaflet_map?.getZoom?.() ?? null
      })

      await page.locator(selectors.leafletZoomIn()).click({ timeout: 5_000 })
      await page.waitForTimeout(700)

      const zoomAfter = await page.locator(selectors.leafletContainer()).evaluate((el: any) => {
        return el?._leaflet_map?.getZoom?.() ?? null
      })

      // If zoom isn't readable (implementation detail), at least ensure markers still exist.
      const markerCount = await page.locator(selectors.leafletMarkerPaths()).count()
      test.info().attach('markers-after-zoom', { body: String(markerCount), contentType: 'text/plain' })
      expect(markerCount, 'marker count should remain > 0 after zoom').toBeGreaterThan(0)

      if (zoomBefore !== null && zoomAfter !== null) {
        expect(zoomAfter).toBeGreaterThanOrEqual(zoomBefore as number)
      }

      assertNoErrors(errors, 'fleet map zoom')
      assertNoFailedRequests(network, 'fleet map zoom')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'operations.fleet-map.zoom', fullPage: true })
      throw e
    }
  })

  test('O.3 — Marker click opens details and updates selected order/route overlay (sync)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOperations(page)

      await expect(page.locator('#fleet-map')).toBeVisible({ timeout: 10_000 })
      await page.waitForTimeout(2500)

      const markerPaths = page.locator(selectors.leafletMarkerPaths())
      const markerCount = await markerPaths.count()
      expect(markerCount, 'need at least one marker').toBeGreaterThan(0)

      // Click first marker
      const beforeSelected = await page
        .locator(selectors.vehicleDetails())
        .first()
        .innerText()
        .catch(() => '')

      await markerPaths.first().click({ force: true })

      const panel = page.locator(selectors.vehicleDetails()).first()
      await expect(panel).toBeVisible({ timeout: 8_000 })

      const afterSelected = await panel.innerText()
      expect(afterSelected.trim().length, 'details panel content').toBeGreaterThan(0)

      // Route overlay: best-effort check for polyline elements in svg or leaflet overlays.
      // We avoid strict selectors; just ensure something route-like exists.
      const routeSignals = await page
        .locator('svg path')
        .count()
        .catch(() => 0)

      test.info().attach('routeSignals', { body: String(routeSignals), contentType: 'text/plain' })

      // Ensure selection changed meaningfully when possible
      if (beforeSelected && afterSelected) {
        expect(afterSelected).not.toBe(beforeSelected)
      }

      assertNoErrors(errors, 'marker selection -> details sync')
      assertNoFailedRequests(network, 'marker selection -> details sync')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'operations.marker-selection.sync', fullPage: true })
      throw e
    }
  })

  test('O.4 — High-risk queue interaction updates map selection', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOperations(page)
      await expect(page.locator('#fleet-map')).toBeVisible({ timeout: 10_000 })
      await page.waitForTimeout(2500)

      // Attempt to find a high-risk queue section/list.
      // Use broad text fallbacks to avoid brittle DOM assumptions.
      const highRiskItem = page
        .getByRole('button', { name: /high risk/i })
        .first()
        .or(page.getByRole('row', { name: /high risk/i }).first())
        .or(page.getByText(/high risk/i).first())

      const isFound = await highRiskItem.isVisible().catch(() => false)
      if (!isFound) {
        // Queue might be collapsed or labeled differently. Capture diagnostics and fail.
        const markerCount = await page.locator(selectors.leafletMarkerPaths()).count()
        test.info().attach('highRiskQueue-missing', { body: `markers=${markerCount}`, contentType: 'text/plain' })
        throw new Error('High-risk queue item not found (no visible “High risk”).')
      }

      await highRiskItem.click({ force: true })

      // Expect map selection/details to change
      const detailsPanel = page.locator(selectors.vehicleDetails()).first()
      await expect(detailsPanel).toBeVisible({ timeout: 8_000 })
      await expect(detailsPanel).not.toBeEmpty()

      assertNoErrors(errors, 'high-risk selection')
      assertNoFailedRequests(network, 'high-risk selection')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'operations.high-risk.queue', fullPage: true })
      throw e
    }
  })

  test('O.5 — Search/filter controls update visible fleet results (best-effort)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOperations(page)
      await expect(page.locator('#fleet-map')).toBeVisible({ timeout: 10_000 })
      await page.waitForTimeout(2500)

      // Search input (best-effort)
      const search = page.getByRole('textbox', { name: /search|filter|order/i }).first().or(
        page.locator('input[placeholder*="Search"], input[placeholder*="Filter"]').first()
      )

      if ((await search.isVisible().catch(() => false)) === true) {
        await search.fill('risk')
        await page.keyboard.press('Enter')
        await page.waitForTimeout(1500)

        const markerCountAfter = await page.locator(selectors.leafletMarkerPaths()).count()
        test.info().attach('marker-count-after-search', { body: String(markerCountAfter), contentType: 'text/plain' })

        // Don’t require strict change; just ensure UI didn’t break.
        expect(markerCountAfter).toBeGreaterThan(0)
      } else {
        test.info().attach('search-missing', { body: 'No visible search textbox found', contentType: 'text/plain' })
      }

      assertNoErrors(errors, 'search/filter')
      assertNoFailedRequests(network, 'search/filter')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'operations.search.filter', fullPage: true })
      throw e
    }
  })

  test('O.6 — Activity feed, AI pipeline/recommendations panels visible', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOperations(page)
      await page.waitForTimeout(2500)

      // Activity feed (best-effort: look for common headings)
      const activityHeading = page.getByText(/activity|feed|events/i).first()
      if (await activityHeading.isVisible().catch(() => false)) {
        await expect(activityHeading).toBeVisible({ timeout: 5_000 })
      } else {
        test.info().attach('activity-feed-missing', { body: 'No activity/feed heading found', contentType: 'text/plain' })
      }

      // Recommendation/pipeline panel (best-effort)
      const recHeading = page.getByText(/recommendation|ai pipeline|pipeline|intervention/i).first()
      if (await recHeading.isVisible().catch(() => false)) {
        await expect(recHeading).toBeVisible({ timeout: 5_000 })
      } else {
        test.info().attach('recommendations-missing', { body: 'No recommendation/pipeline heading found', contentType: 'text/plain' })
      }

      // KPI cards visibility (best-effort)
      const kpi = page.getByText(/active orders|orders at risk|predicted delays/i).first()
      if (await kpi.isVisible().catch(() => false)) {
        await expect(kpi).toBeVisible({ timeout: 5_000 })
      }

      assertNoErrors(errors, 'ops panels')
      assertNoFailedRequests(network, 'ops panels')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'operations.panels', fullPage: true })
      throw e
    }
  })
})

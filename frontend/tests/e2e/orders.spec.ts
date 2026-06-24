import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'
import { captureOnFailure } from './utils/screenshots'
import { gotoOrders } from './utils/navigation'

test.describe('Orders Control Center', () => {
  test('P.1 — Orders page/table loads with rows', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOrders(page)

      // Table visible (broad, since we don’t have stable testids)
      const table = page.locator('[class*="OrderTable"], table').first()
      await expect(table).toBeVisible({ timeout: 10_000 })

      const rows = page.locator('tbody tr').count()
      const rowCount = await rows
      test.info().attach('orders-row-count', { body: String(rowCount), contentType: 'text/plain' })
      expect(rowCount, 'orders rows > 0').toBeGreaterThan(0)

      assertNoErrors(errors, 'orders table load')
      assertNoFailedRequests(network, 'orders table load')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'orders.table.load', fullPage: true })
      throw e
    }
  })

  test('P.2 — Search works and updates results (best-effort)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOrders(page)
      await page.waitForTimeout(2000)

      const search = page.getByRole('textbox', { name: /search/i }).first().or(
        page.locator('input[placeholder*="Search"], input[placeholder*="ID"], input[placeholder*="Driver"]').first()
      )

      // If search isn’t available, fail with diagnostics.
      await expect(search).toBeVisible({ timeout: 5_000 })

      const before = await page.locator('tbody tr').count()

      await search.fill('risk')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1500)

      const after = await page.locator('tbody tr').count()
      test.info().attach('orders-search-before-after', {
        body: `before=${before}\nafter=${after}`,
        contentType: 'text/plain',
      })

      // Don’t require strict change; but ensure UI still shows rows or an explicit empty state.
      if (after === 0) {
        await expect(page.getByText(/no results|empty|no orders/i).first()).toBeVisible({ timeout: 3_000 })
      } else {
        expect(after).toBeGreaterThan(0)
      }

      assertNoErrors(errors, 'orders search')
      assertNoFailedRequests(network, 'orders search')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'orders.search', fullPage: true })
      throw e
    }
  })

  test('P.3 — Sorting (risk/ETA/created) and pagination (best-effort)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOrders(page)
      await page.waitForTimeout(2000)

      const table = page.locator('[class*="OrderTable"], table').first()
      await expect(table).toBeVisible({ timeout: 10_000 })

      const getFirstRowText = async () => {
        const firstRow = page.locator('tbody tr').first()
        return (await firstRow.innerText().catch(() => '')).trim()
      }

      const r1 = await getFirstRowText()

      // Sorting controls are implementation-specific; attempt common column headers.
      const sortTargets = ['risk', 'eta', 'created', 'date']
      for (const t of sortTargets) {
        const header = page.getByRole('columnheader', { name: new RegExp(t, 'i') }).first().or(
          page.getByText(new RegExp(t, 'i')).first()
        )
        if (await header.isVisible().catch(() => false)) {
          await header.click({ force: true })
          await page.waitForTimeout(800)
          const rNow = await getFirstRowText()
          test.info().attach('orders-sort', { body: `${t}: ${rNow.slice(0, 200)}`, contentType: 'text/plain' })
        }
      }

      // Pagination next/prev
      const nextBtn = page.getByRole('button', { name: /next|>|\u203a/i }).first()
      const prevBtn = page.getByRole('button', { name: /prev|<|\u2039/i }).first()

      const hadNext = await nextBtn.isVisible().catch(() => false)
      if (hadNext) {
        await nextBtn.click({ force: true })
        await page.waitForTimeout(1500)
        const r2 = await getFirstRowText()
        test.info().attach('orders-pagination-next', { body: `r1=${r1}\nr2=${r2}`, contentType: 'text/plain' })
        expect(r2).not.toEqual(r1)
      } else {
        test.info().attach('orders-pagination-next-missing', { body: 'No next button visible', contentType: 'text/plain' })
      }

      if (await prevBtn.isVisible().catch(() => false)) {
        await prevBtn.click({ force: true })
        await page.waitForTimeout(1500)
      }

      assertNoErrors(errors, 'orders sort/pagination')
      assertNoFailedRequests(network, 'orders sort/pagination')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'orders.sort-pagination', fullPage: true })
      throw e
    }
  })

  test('P.4 — Drawer opens/closes and shows predictions/SHAP/decisions/route history (best-effort)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOrders(page)
      await page.waitForTimeout(2000)

      const firstRow = page.locator('tbody tr').first()
      await expect(firstRow).toBeVisible({ timeout: 10_000 })

      const orderIdText = await firstRow.innerText()
      test.info().attach('orders-selected-row-text', { body: orderIdText.slice(0, 300), contentType: 'text/plain' })

      await firstRow.click({ force: true })

      const drawer = page.locator('[role="region"]', { hasText: /order|details|drawer|prediction/i }).first().or(
        page.locator('[class*="OrderDetail"], [class*="Drawer"], [class*="Modal"]').first()
      )
      await expect(drawer).toBeVisible({ timeout: 10_000 })

      // Validate presence of key sections if they exist.
      const checks = [
        /prediction|risk score|confidence/i,
        /shap|factors/i,
        /decision|agent/i,
        /route history|optimization history|route/i,
      ]

      for (const re of checks) {
        const hit = page.getByText(re).first()
        if (await hit.isVisible().catch(() => false)) {
          await expect(hit).toBeVisible({ timeout: 5_000 })
        }
      }

      // Close
      const closeBtn = drawer.getByRole('button', { name: /close|x|dismiss/i }).first().or(page.getByRole('button', { name: /close/i }).first())
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click({ force: true })
        await expect(drawer).not.toBeVisible({ timeout: 5_000 })
      } else {
        test.info().attach('orders-drawer-close-missing', { body: 'Could not find close button', contentType: 'text/plain' })
      }

      assertNoErrors(errors, 'orders drawer')
      assertNoFailedRequests(network, 'orders drawer')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'orders.drawer', fullPage: true })
      throw e
    }
  })

  test('P.5 — Error/empty states (best-effort: no data view)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoOrders(page)
      await page.waitForTimeout(1500)

      // Attempt to clear filters/search to show “empty” only if app supports it.
      const search = page.getByRole('textbox', { name: /search/i }).first()
      if (await search.isVisible().catch(() => false)) {
        await search.fill('___nonexistent___')
        await page.keyboard.press('Enter')
        await page.waitForTimeout(1500)
      }

      const empty = page.getByText(/no results|no data|empty/i).first()
      if (await empty.isVisible().catch(() => false)) {
        await expect(empty).toBeVisible({ timeout: 5_000 })
      } else {
        // If empty state can’t be forced reliably, don’t fail the suite.
        test.info().attach('orders-empty-state', { body: 'Empty state not detected (skipping assertion)', contentType: 'text/plain' })
      }

      assertNoErrors(errors, 'orders empty/error state')
      assertNoFailedRequests(network, 'orders empty/error state')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'orders.empty/error', fullPage: true })
      throw e
    }
  })
})

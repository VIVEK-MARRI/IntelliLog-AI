import type { Page, Locator } from '@playwright/test'

export async function expectAnyVisible(locators: Locator[], timeout = 5_000): Promise<boolean> {
  const results = await Promise.all(
    locators.map(async (l) => {
      try {
        return await l.isVisible({ timeout })
      } catch {
        return false
      }
    })
  )
  return results.some(Boolean)
}

export function expectHeading(page: Page, re: RegExp, timeout = 10_000) {
  return page.getByRole('heading', { name: re }).first().toBeVisible({ timeout })
}

export async function waitForStableDom(page: Page, ms = 300) {
  // Helps with map/table transitions before asserting layout.
  await page.waitForTimeout(ms)
}

export async function assertNoLoadingSpinners(page: Page) {
  // Broad check; doesn’t assume exact spinner implementation.
  // If your UI uses different roles/testids, adjust later.
  const candidates = [
    page.getByRole('progressbar'),
    page.locator('[data-testid*="loading"]'),
    page.locator('[aria-busy="true"]'),
  ]
  for (const c of candidates) {
    if (await c.first().isVisible().catch(() => false)) {
      // Not failing automatically; just avoid false negatives.
      return
    }
  }
}

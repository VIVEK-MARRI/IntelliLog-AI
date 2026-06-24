import type { Page } from '@playwright/test'
import { login } from '../../fixtures/auth'

export async function gotoMissionControl(page: Page) {
  await page.goto('/mission-control', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
}

export async function gotoOperations(page: Page) {
  await page.goto('/operations', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
}

export async function gotoOrders(page: Page) {
  await page.goto('/orders', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
}

export async function gotoAIWorkspace(page: Page) {
  const paths = ['/copilot', '/ai-workspace', '/copilot-workspace']
  for (const p of paths) {
    await page.goto(p, { waitUntil: 'domcontentloaded' })
    const ok = await page.getByText(/copilot|ai assistant|workspace/i).first().isVisible().catch(() => false)
    if (ok) return
  }
  await page.goto(paths[0], { waitUntil: 'domcontentloaded' })
}

export async function gotoExecutive(page: Page) {
  await page.goto('/executive', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
}

export async function gotoSystemHealth(page: Page) {
  await page.goto('/system-health', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
}

export async function ensureAuthed(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem('auth_token')).catch(() => null)
  if (!token) await login(page)
  await page.waitForSelector('body', { timeout: 10_000 })
  await page.waitForTimeout(250)
}

export async function gotoFromSidebar(
  page: Page,
  target: 'operations' | 'orders' | 'mission-control' | 'executive' | 'system-health'
) {
  // Prefer role-based navigation.
  await page.getByRole('navigation').waitFor({ state: 'visible', timeout: 10_000 })

  const labelMap: Record<typeof target, RegExp> = {
    'mission-control': /mission control/i,
    operations: /operations/i,
    orders: /orders/i,
    executive: /executive/i,
    'system-health': /system health/i,
  }

  const link = page.getByRole('link', { name: labelMap[target] }).first()
  await link.click()
}

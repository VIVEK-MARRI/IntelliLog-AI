import type { Page } from '@playwright/test'

export const TEST_USER = {
  email: process.env.E2E_EMAIL ?? 'qa@intellilog.ai',
  password: process.env.E2E_PASSWORD ?? 'TestPassword!23',
}

export const API_URL = process.env.VITE_API_URL ?? 'http://localhost:8000'

export async function login(page: Page, user = TEST_USER): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(user.email)
  await page.getByLabel(/password/i).fill(user.password)
  await page.getByRole('button', { name: /sign in|log in|login/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
}

export async function logout(page: Page): Promise<void> {
  const userMenu = page.getByRole('button', { name: /user menu|account|profile/i })
  if (await userMenu.isVisible().catch(() => false)) {
    await userMenu.click()
    await page.getByRole('button', { name: /log out|sign out/i }).click()
  } else {
    await page.evaluate(() => {
      window.localStorage.removeItem('auth_token')
    })
    await page.goto('/login')
  }
  await page.waitForURL(/\/login/, { timeout: 10_000 })
}

export async function clearAuth(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

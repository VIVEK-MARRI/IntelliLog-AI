import { test, expect } from '@playwright/test'
import { TEST_USER } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'

test.describe('Login flow', () => {
  test('A.1 — Login form renders at /login', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    await page.goto('/login')
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in|log in|login/i })).toBeVisible()

    assertNoErrors(errors, 'login page render')
    assertNoFailedRequests(network, 'login page render')
  })

  test('A.2 — Valid credentials redirect to /dashboard', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    await page.goto('/login')
    await page.getByLabel(/email/i).fill(TEST_USER.email)
    await page.getByLabel(/password/i).fill(TEST_USER.password)
    await page.getByRole('button', { name: /sign in|log in|login/i }).click()

    await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
    await expect(page).toHaveURL(/\/dashboard/)

    assertNoErrors(errors, 'login submit')
    assertNoFailedRequests(network, 'login submit')
  })

  test('A.3 — Invalid credentials show error and stay on /login', async ({ page }) => {
    const errors = captureConsoleErrors(page)

    await page.goto('/login')
    await page.getByLabel(/email/i).fill('wrong@example.com')
    await page.getByLabel(/password/i).fill('definitely-wrong-password')
    await page.getByRole('button', { name: /sign in|log in|login/i }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    const errorIndicator = page.getByText(/invalid|incorrect|failed|denied/i).first()
    await expect(errorIndicator).toBeVisible({ timeout: 5_000 })

    assertNoErrors(errors.filter((e) => !e.text.toLowerCase().includes('4')), 'invalid login')
  })
})

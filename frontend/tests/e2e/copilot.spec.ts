import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'

test.describe('AI Copilot', () => {
  test('F.1 — Copilot button opens the panel', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    await login(page)
    const copilotBtn = page.getByRole('button', { name: /copilot|command center|ai assistant/i })
    await expect(copilotBtn).toBeVisible({ timeout: 10_000 })
    await copilotBtn.click()

    const input = page.getByPlaceholder(/ask about|ask a question/i)
    await expect(input).toBeVisible({ timeout: 5_000 })

    assertNoErrors(errors, 'copilot open')
    assertNoFailedRequests(network, 'copilot open')
  })

  test('F.2 — Query returns a response with confidence, evidence, recommendations', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    await login(page)
    await page.getByRole('button', { name: /copilot|command center|ai assistant/i }).click()
    const input = page.getByPlaceholder(/ask about|ask a question/i)
    await input.fill('Which orders are at high risk right now?')
    await input.press('Enter')

    await expect(page.getByText(/confidence/i).first()).toBeVisible({ timeout: 15_000 })
    const evidenceHeading = page.getByText(/evidence/i).first()
    await expect(evidenceHeading).toBeVisible({ timeout: 5_000 })
    const recHeading = page.getByText(/recommendation/i).first()
    await expect(recHeading).toBeVisible({ timeout: 5_000 })

    assertNoErrors(errors, 'copilot response')
    assertNoFailedRequests(network, 'copilot response')
  })

  test('F.3 — No placeholder text in copilot response', async ({ page }) => {
    await login(page)
    await page.getByRole('button', { name: /copilot|command center|ai assistant/i }).click()
    await page.getByPlaceholder(/ask about|ask a question/i).fill('Summarize fleet status')
    await page.getByPlaceholder(/ask about|ask a question/i).press('Enter')

    await page.waitForTimeout(8000)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/lorem ipsum/i)
    expect(bodyText).not.toMatch(/TODO/i)
    expect(bodyText).not.toMatch(/placeholder response/i)
  })
})

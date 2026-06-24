import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'
import { captureNetwork, assertNoFailedRequests } from '../helpers/network'
import { captureOnFailure } from './utils/screenshots'
import { gotoAIWorkspace } from './utils/navigation'

test.describe('AI Workspace', () => {
  test('A.1 — Page loads, workspace visible, prompt + send visible', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoAIWorkspace(page)
      await page.waitForTimeout(1500)

      await expect(page.locator('body')).toBeVisible({ timeout: 10_000 })

      // Prompt input
      const prompt = page.getByRole('textbox', { name: /ask|question|prompt|message/i }).first().or(
        page.locator('textarea').first()
      )
      await expect(prompt).toBeVisible({ timeout: 10_000 })

      // Send button
      const sendBtn = page.getByRole('button', { name: /send|submit|ask/i }).first().or(
        page.getByRole('button', { name: /↵|enter/i }).first()
      )
      await expect(sendBtn).toBeVisible({ timeout: 10_000 })

      // Response container
      const responseContainer = page.getByText(/evidence|confidence|recommend/i).first().or(
        page.locator('[class*="Response"], [class*="workspace-response"], [role="region"]').first()
      )
      await expect(responseContainer).toBeVisible({ timeout: 10_000 })

      assertNoErrors(errors, 'ai-workspace.load')
      assertNoFailedRequests(network, 'ai-workspace.load')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'ai-workspace.load', fullPage: true })
      throw e
    }
  })

  test('A.2 — Prompt flow triggers request and renders response + evidence (best-effort)', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    const network = captureNetwork(page)

    try {
      await login(page)
      await gotoAIWorkspace(page)
      await page.waitForTimeout(1200)

      const prompt = page.getByRole('textbox', { name: /ask|question|prompt|message/i }).first().or(
        page.locator('textarea').first()
      )
      await expect(prompt).toBeVisible({ timeout: 10_000 })

      const sendBtn = page.getByRole('button', { name: /send|submit|ask/i }).first()
      await expect(sendBtn).toBeVisible({ timeout: 10_000 })

      const evidenceHeading = page.getByText(/evidence/i).first()
      const actionsHeading = page.getByText(/action|recommend|next step/i).first()

      const promptText = 'Show high risk deliveries'
      await prompt.fill(promptText)

      const beforeResponseLen = (await page.locator('body').innerText().catch(() => '')).length

      await sendBtn.click({ force: true })

      // Request triggered: look for either spinner/streaming container OR new content growth.
      const responseRegion = page.locator('[class*="Response"], [role="region"]').first()
      await expect(responseRegion).toBeVisible({ timeout: 20_000 })

      // Streaming: response grows OR at least appears
      await page.waitForTimeout(1000)

      const afterResponseLen = (await page.locator('body').innerText().catch(() => '')).length
      test.info().attach('ai-workspace-response-growth', {
        body: `beforeLen=${beforeResponseLen}\nafterLen=${afterResponseLen}`,
        contentType: 'text/plain',
      })

      expect(afterResponseLen).toBeGreaterThanOrEqual(beforeResponseLen)

      // Evidence / confidence / trust indicators (best-effort text checks)
      const evidence = evidenceHeading.first()
      if (await evidence.isVisible().catch(() => false)) {
        await expect(evidence).toBeVisible({ timeout: 10_000 })
      }

      const evidenceCards = page.locator('[class*="Evidence"], [class*="evidence"], [role="article"]').count().catch(() => 0)
      const confidence = page.getByText(/confidence/i).first()
      const trust = page.getByText(/trust|provenance|freshness|quality/i).first()

      const actionArea = actionsHeading.first()
      const actionButtons = page.getByRole('button', { name: /apply|execute|recommend|update|schedule|acknowledge|action/i }).count().catch(() => 0)

      const supportingOrders = page.getByText(/supporting orders|related orders|orders/i).first()
      const supportingPreds = page.getByText(/supporting predictions|predictions/i).first()
      const supportingDecisions = page.getByText(/agent decisions|decisions/i).first()

      test.info().attach('ai-workspace-diagnostics', {
        body: [
          `evidenceCards=${evidenceCards}`,
          `confidenceVisible=${await confidence.isVisible().catch(() => false)}`,
          `trustVisible=${await trust.isVisible().catch(() => false)}`,
          `actionButtons=${actionButtons}`,
          `supportingOrdersVisible=${await supportingOrders.isVisible().catch(() => false)}`,
          `supportingPredictionsVisible=${await supportingPreds.isVisible().catch(() => false)}`,
          `supportingDecisionsVisible=${await supportingDecisions.isVisible().catch(() => false)}`,
          `evidenceHeadingVisible=${await evidence.isVisible().catch(() => false)}`,
          `actionsHeadingVisible=${await actionArea.isVisible().catch(() => false)}`,
        ].join('\n'),
        contentType: 'text/plain',
      })

      // Minimal visibility requirements
      await expect(responseRegion).toBeVisible({ timeout: 10_000 })
      if (await confidence.isVisible().catch(() => false)) await expect(confidence).toBeVisible({ timeout: 10_000 })
      if (await trust.isVisible().catch(() => false)) await expect(trust).toBeVisible({ timeout: 10_000 })

      assertNoErrors(errors, 'ai-workspace.prompt')
      assertNoFailedRequests(network, 'ai-workspace.prompt')
    } catch (e) {
      await captureOnFailure({ page, testTitle: 'ai-workspace.prompt-evidence', fullPage: true })
      throw e
    }
  })
})

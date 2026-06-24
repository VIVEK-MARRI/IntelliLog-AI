import type { Page } from '@playwright/test'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function timestampForFilename(d = new Date()) {
  // YYYY-MM-DD_HH-mm-ss_SSS
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(
    d.getMinutes()
  )}-${pad2(d.getSeconds())}_${String(d.getMilliseconds()).padStart(3, '0')}`
}

export function screenshotName(base: string, variant?: string) {
  const ts = timestampForFilename()
  return variant ? `${base}.${variant}.${ts}.png` : `${base}.${ts}.png`
}

export async function captureOnFailure(opts: {
  page: Page
  folder?: string
  testTitle: string
  screenshotBase?: string
  fullPage?: boolean
}) {
  const {
    page,
    folder = 'screenshots',
    testTitle,
    screenshotBase = 'failure',
    fullPage = true,
  } = opts

  const safeTitle = testTitle.replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 80)
  const fileName = screenshotName(`${screenshotBase}.${safeTitle}`, fullPage ? 'full' : 'view')

  // Playwright will create directories if needed.
  await page.screenshot({
    path: `test-results/${folder}/${fileName}`,
    fullPage,
  })
}

export async function captureFullPage(page: Page, nameBase: string) {
  const fileName = screenshotName(nameBase, 'full')
  await page.screenshot({ path: `test-results/screenshots/${fileName}`, fullPage: true })
}

export async function captureViewport(page: Page, nameBase: string) {
  const fileName = screenshotName(nameBase, 'viewport')
  await page.screenshot({ path: `test-results/screenshots/${fileName}`, fullPage: false })
}

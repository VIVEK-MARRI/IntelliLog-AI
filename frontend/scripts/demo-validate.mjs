#!/usr/bin/env node
// npm run demo:validate
// Runs smoke checks + Playwright + (optionally) k6 and produces a readiness report.

import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runSmokeChecks } from './smoke-checks.mjs'

const ROOT = process.cwd()
const REPORTS = join(ROOT, 'reports')
if (!existsSync(REPORTS)) mkdirSync(REPORTS, { recursive: true })

const FLAGS = parseArgs(process.argv.slice(2))
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--skip-playwright' || a === '--no-e2e' || a === '--skip-e2e') out.skipPlaywright = true
    else if (a === '--skip-k6' || a === '--no-load' || a === '--skip-load') out.skipK6 = true
    else if (a === '--skip-smoke') out.skipSmoke = true
    else if (a === '--no-report') out.noReport = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (a === '--profile' && argv[i + 1]) { out.profile = argv[++i] }
    else if (a.startsWith('--profile=')) out.profile = a.split('=')[1]
  }
  return out
}
if (FLAGS.help) {
  console.log(`Usage: node scripts/demo-validate.mjs [flags]

Flags:
  --skip-playwright, --no-e2e    Skip Playwright E2E suite
  --skip-k6, --no-load           Skip k6 load test
  --skip-smoke                   Skip API/WS/Copilot smoke checks
  --no-report                    Don't write report files
  --profile <small|medium|large> Load test profile (default: small)
  --help, -h                     Show this help

Env vars (still supported):
  SKIP_PLAYWRIGHT=1              Skip Playwright
  SKIP_K6=1                      Skip k6
  SKIP_SMOKE=1                   Skip smoke checks
  LOAD_PROFILE=medium            Load test profile
`)
  process.exit(0)
}

const SKIP_PLAYWRIGHT = FLAGS.skipPlaywright || process.env.SKIP_PLAYWRIGHT === '1'
const SKIP_K6 = FLAGS.skipK6 || process.env.SKIP_K6 === '1'
const SKIP_SMOKE = FLAGS.skipSmoke || process.env.SKIP_SMOKE === '1'
const NO_REPORT = FLAGS.noReport
const PROFILE = FLAGS.profile || process.env.LOAD_PROFILE || 'small'

function log(level, msg) {
  const ts = new Date().toISOString()
  const colors = { info: '\x1b[36m', pass: '\x1b[32m', fail: '\x1b[31m', warn: '\x1b[33m', reset: '\x1b[0m' }
  const c = colors[level] ?? ''
  console.log(`${c}[${ts}] [${level.toUpperCase()}]${colors.reset} ${msg}`)
}

async function runCmd(name, cmd, args, opts = {}) {
  log('info', `▶ ${name}: ${cmd} ${args.join(' ')}`)
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd: ROOT, stdio: 'pipe', shell: process.platform === 'win32', ...opts })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d) => { const s = d.toString(); stdout += s; process.stdout.write(s) })
    proc.stderr?.on('data', (d) => { const s = d.toString(); stderr += s; process.stderr.write(s) })
    proc.on('close', (code) => resolve({ name, code, stdout, stderr }))
  })
}

function calcScore(results) {
  const total = results.length
  const passed = results.filter((r) => r.pass).length
  return total === 0 ? 0 : Math.round((passed / total) * 100)
}

function severityOf(failure) {
  if (failure.critical) return 'CRITICAL'
  if (failure.high) return 'HIGH'
  if (failure.medium) return 'MEDIUM'
  return 'LOW'
}

async function main() {
  log('info', '=== IntelliLog-AI Demo Validation ===')
  const startMs = Date.now()

  const smokeResults = SKIP_SMOKE ? [{ name: 'smoke.skipped', pass: true, status: 0, ms: 0, detail: 'skipped (--skip-smoke)' }] : await runSmokeChecks()
  const smokePass = smokeResults.filter((r) => r.pass).length
  const smokeFail = smokeResults.length - smokePass
  log(smokeFail === 0 ? 'pass' : 'fail', `Smoke: ${smokePass}/${smokeResults.length} passed`)

  let playwrightResult = null
  if (!SKIP_PLAYWRIGHT) {
    playwrightResult = await runCmd('playwright', 'npx', [
      'playwright', 'test',
      '--reporter=line,json',
    ])
    log(playwrightResult.code === 0 ? 'pass' : 'fail', `Playwright: exit ${playwrightResult.code}`)
  } else {
    log('warn', 'Playwright skipped (SKIP_PLAYWRIGHT=1)')
  }

  let k6Result = null
  if (!SKIP_K6) {
    k6Result = await runCmd('k6', 'k6', [
      'run',
      `-ePROFILE=${PROFILE}`,
      `tests/load/dashboard.js`,
    ], { env: { ...process.env, PROFILE } })
    log(k6Result.code === 0 ? 'pass' : 'fail', `k6 (${PROFILE}): exit ${k6Result.code}`)
  } else {
    log('warn', 'k6 skipped (SKIP_K6=1)')
  }

  const allChecks = [...smokeResults]
  let playwrightFailures = []
  let playwrightTotal = 0
  let playwrightPassed = 0

  const pwJsonPath = join(REPORTS, 'playwright-results.json')
  if (existsSync(pwJsonPath)) {
    try {
      const pw = JSON.parse(readFileSync(pwJsonPath, 'utf8'))
      const stats = pw.stats || {}
      playwrightTotal = stats.expected ?? 0
      const unexpected = stats.unexpected ?? 0
      playwrightPassed = playwrightTotal - unexpected
      const failedSuites = (pw.suites || []).flatMap(extractFailures)
      playwrightFailures = failedSuites
      allChecks.push(
        ...failedSuites.map((f) => ({
          name: `playwright.${f.spec}`,
          pass: false,
          status: 0,
          ms: 0,
          detail: f.error,
          critical: f.critical,
          high: f.high,
        }))
      )
    } catch (e) {
      log('warn', `Failed to parse playwright results: ${e.message}`)
    }
  }

  const passed = allChecks.filter((r) => r.pass).length
  const failed = allChecks.length - passed
  const score = calcScore(allChecks)

  const criticalFailures = allChecks.filter((r) => !r.pass && r.critical)
  let classification = 'Not Ready'
  if (criticalFailures.length === 0 && score >= 90) classification = 'Ready for Production Candidate'
  else if (criticalFailures.length === 0 && score >= 75) classification = 'Ready for Demo'
  else if (criticalFailures.length === 0 && score >= 60) classification = 'Ready for Hackathon'
  else if (score >= 40) classification = 'Ready for Portfolio'

  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    summary: {
      total: allChecks.length,
      passed,
      failed,
      score,
      classification,
    },
    smoke: smokeResults,
    playwright: {
      total: playwrightTotal,
      passed: playwrightPassed,
      failed: playwrightTotal - playwrightPassed,
      failures: playwrightFailures.map((f) => ({
        spec: f.spec,
        error: f.error,
        severity: severityOf(f),
      })),
    },
    k6: k6Result ? {
      profile: PROFILE,
      exitCode: k6Result.code,
      passed: k6Result.code === 0,
    } : null,
    knownDefects: criticalFailures.map((c) => ({
      check: c.name,
      detail: c.detail,
      severity: 'CRITICAL',
      reproduction: 'Run `npm run demo:validate`',
    })),
  }

  if (!NO_REPORT) {
    writeFileSync(join(REPORTS, 'demo-readiness.json'), JSON.stringify(report, null, 2))
    writeFileSync(join(REPORTS, 'demo-readiness.md'), renderMarkdown(report))
    writeFileSync(join(REPORTS, 'demo-readiness.html'), renderHtml(report))
  }

  console.log('\n' + '='.repeat(60))
  console.log(`DEMO READINESS SCORE: ${score}/100`)
  console.log(`CLASSIFICATION: ${classification}`)
  console.log(`Passed: ${passed}/${allChecks.length}  Failed: ${failed}`)
  console.log(`Critical defects: ${criticalFailures.length}`)
  console.log('='.repeat(60))
  if (!NO_REPORT) {
    console.log(`\nReports written to ${REPORTS}/`)
    console.log(`  - demo-readiness.json`)
    console.log(`  - demo-readiness.md`)
    console.log(`  - demo-readiness.html`)
    console.log(`  - playwright-results.json (if Playwright ran)`)
  }

  if (criticalFailures.length > 0) process.exit(1)
  if (failed > 0) process.exit(2)
  process.exit(0)
}

function extractFailures(suite) {
  const out = []
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const results = test.results || []
      for (const r of results) {
        if (r.status === 'failed' || r.status === 'timedOut') {
          out.push({
            spec: spec.title || suite.title || 'unknown',
            error: r.error?.message?.split('\n')[0] || 'failed',
            critical: /login|crash|web.?socket|blank|memory leak/i.test(spec.title || ''),
            high: /copilot|map|route|optimization/i.test(spec.title || ''),
          })
        }
      }
    }
  }
  for (const child of suite.suites || []) {
    out.push(...extractFailures(child))
  }
  return out
}

function renderMarkdown(r) {
  const lines = []
  lines.push(`# IntelliLog-AI Demo Readiness Report`)
  lines.push('')
  lines.push(`**Generated:** ${r.generatedAt}`)
  lines.push(`**Duration:** ${(r.durationMs / 1000).toFixed(1)}s`)
  lines.push('')
  lines.push(`## Score: ${r.summary.score}/100`)
  lines.push(`**Classification: ${r.summary.classification}**`)
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Total checks | ${r.summary.total} |`)
  lines.push(`| Passed | ${r.summary.passed} |`)
  lines.push(`| Failed | ${r.summary.failed} |`)
  lines.push('')
  lines.push(`## Smoke checks`)
  lines.push(`| Check | Pass | Status | Latency | Detail |`)
  lines.push(`|-------|------|--------|---------|--------|`)
  for (const c of r.smoke) {
    lines.push(`| ${c.name} | ${c.pass ? '✓' : '✗'} | ${c.status} | ${c.ms}ms | ${c.detail || ''} |`)
  }
  lines.push('')
  lines.push(`## Playwright E2E`)
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Total specs | ${r.playwright.total} |`)
  lines.push(`| Passed | ${r.playwright.passed} |`)
  lines.push(`| Failed | ${r.playwright.failed} |`)
  if (r.playwright.failures.length > 0) {
    lines.push('')
    lines.push(`### Failures`)
    for (const f of r.playwright.failures) {
      lines.push(`- **${f.severity}** ${f.spec} — ${f.error}`)
    }
  }
  lines.push('')
  if (r.k6) {
    lines.push(`## Load test (k6 ${r.k6.profile})`)
    lines.push(`Exit code: ${r.k6.exitCode} (${r.k6.passed ? 'PASS' : 'FAIL'})`)
    lines.push('')
  }
  if (r.knownDefects.length > 0) {
    lines.push(`## Critical defects`)
    for (const d of r.knownDefects) {
      lines.push(`- **${d.severity}** ${d.check} — ${d.detail}`)
      lines.push(`  - Reproduction: \`${d.reproduction}\``)
    }
  } else {
    lines.push(`## Critical defects: none`)
  }
  return lines.join('\n')
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function renderHtml(r) {
  const scoreColor = r.summary.score >= 90 ? '#22c55e' : r.summary.score >= 75 ? '#3b82f6' : r.summary.score >= 60 ? '#f59e0b' : '#ef4444'
  const classEmoji = {
    'Ready for Production Candidate': '🟢',
    'Ready for Demo': '🔵',
    'Ready for Hackathon': '🟡',
    'Ready for Portfolio': '🟠',
    'Not Ready': '🔴',
  }[r.summary.classification] || '⚪'

  const smokeRows = r.smoke.map((c) => `
    <tr>
      <td>${esc(c.name)}</td>
      <td class="${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '✗'}</td>
      <td>${esc(c.status)}</td>
      <td>${esc(c.ms)}ms</td>
      <td>${esc(c.detail || '')}</td>
    </tr>`).join('')

  const pwRows = r.playwright.failures.map((f) => `
    <tr>
      <td><span class="sev sev-${esc(f.severity.toLowerCase())}">${esc(f.severity)}</span></td>
      <td>${esc(f.spec)}</td>
      <td>${esc(f.error)}</td>
    </tr>`).join('')

  const k6Block = r.k6 ? `
    <div class="card">
      <h2>k6 Load test (${esc(r.k6.profile)})</h2>
      <p>Exit code: <strong>${esc(r.k6.exitCode)}</strong> — ${r.k6.passed ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>'}</p>
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>IntelliLog-AI — Demo Readiness</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; margin: 0; padding: 2rem; max-width: 1200px; margin: 0 auto; background: #0b1020; color: #e6e8ee; }
  h1 { margin: 0 0 0.5rem 0; font-size: 1.6rem; }
  h2 { font-size: 1.1rem; margin: 0 0 0.75rem 0; color: #b8c0d0; text-transform: uppercase; letter-spacing: 0.05em; }
  .meta { color: #8b94a8; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .score-card { display: flex; align-items: center; gap: 1.5rem; padding: 1.5rem; border-radius: 12px; background: linear-gradient(135deg, ${scoreColor}22, transparent); border: 1px solid ${scoreColor}55; margin-bottom: 1.5rem; }
  .score { font-size: 4rem; font-weight: 800; color: ${scoreColor}; line-height: 1; }
  .classification { font-size: 1.4rem; font-weight: 600; }
  .class-detail { color: #b8c0d0; }
  .card { background: #131a30; border: 1px solid #1f2a4a; border-radius: 10px; padding: 1.25rem; margin-bottom: 1.25rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #1f2a4a; }
  th { color: #8b94a8; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .pass { color: #22c55e; font-weight: 700; }
  .fail { color: #ef4444; font-weight: 700; }
  .sev { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; }
  .sev-critical { background: #ef4444; color: white; }
  .sev-high { background: #f59e0b; color: black; }
  .sev-medium { background: #3b82f6; color: white; }
  .sev-low { background: #6b7280; color: white; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-top: 1rem; }
  .stat { background: #0b1020; padding: 0.75rem; border-radius: 8px; border: 1px solid #1f2a4a; }
  .stat-label { color: #8b94a8; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-value { font-size: 1.4rem; font-weight: 700; margin-top: 0.25rem; }
</style>
</head>
<body>
  <h1>IntelliLog-AI — Demo Readiness</h1>
  <div class="meta">Generated ${esc(r.generatedAt)} · ${(r.durationMs / 1000).toFixed(1)}s</div>

  <div class="score-card">
    <div class="score">${r.summary.score}<span style="font-size:1.5rem;color:#8b94a8">/100</span></div>
    <div>
      <div class="classification">${classEmoji} ${esc(r.summary.classification)}</div>
      <div class="class-detail">${r.summary.passed}/${r.summary.total} checks passed · ${r.knownDefects.length} critical defects</div>
    </div>
  </div>

  <div class="card">
    <h2>Smoke checks</h2>
    <table>
      <thead><tr><th>Check</th><th>Pass</th><th>Status</th><th>Latency</th><th>Detail</th></tr></thead>
      <tbody>${smokeRows || '<tr><td colspan="5" style="color:#8b94a8">No smoke checks ran</td></tr>'}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>Playwright E2E</h2>
    <div class="stats">
      <div class="stat"><div class="stat-label">Specs</div><div class="stat-value">${r.playwright.total}</div></div>
      <div class="stat"><div class="stat-label">Passed</div><div class="stat-value pass">${r.playwright.passed}</div></div>
      <div class="stat"><div class="stat-label">Failed</div><div class="stat-value fail">${r.playwright.failed}</div></div>
    </div>
    ${r.playwright.failures.length > 0 ? `
      <table>
        <thead><tr><th>Severity</th><th>Spec</th><th>Error</th></tr></thead>
        <tbody>${pwRows}</tbody>
      </table>
    ` : '<p style="color:#22c55e;margin-top:1rem">All Playwright specs passed.</p>'}
  </div>

  ${k6Block}

  <div class="card">
    <h2>Critical defects</h2>
    ${r.knownDefects.length === 0
      ? '<p class="pass">No critical defects.</p>'
      : `<table>
          <thead><tr><th>Severity</th><th>Check</th><th>Detail</th></tr></thead>
          <tbody>${r.knownDefects.map((d) => `
            <tr>
              <td><span class="sev sev-critical">CRITICAL</span></td>
              <td>${esc(d.check)}</td>
              <td>${esc(d.detail)}</td>
            </tr>`).join('')}</tbody>
        </table>`}
  </div>
</body>
</html>`
}

main().catch((e) => {
  log('fail', e.stack || e.message)
  process.exit(1)
})

import './style.css'
import type { UsageState, UsageWindow } from '../../shared/types'

const BAR_WIDTH = 16

const MASCOT = ['▐▛███▜▌', '▝▜█████▛▘', '▘▘ ▝▝'].join('\n')

const app = document.getElementById('app')

if (!app) {
  throw new Error('#app root element missing')
}

app.innerHTML = `
  <div class="terminal">
    <div class="term-drag"></div>
    <span class="term-title">Claude Usage</span>
    <button class="term-close" id="close-btn" title="Close">[x]</button>
    <pre class="mascot">${MASCOT}</pre>
    <div class="metric" id="metric-5h">
      <div class="metric-row">
        <span class="metric-label">5h</span>
        <span class="metric-bar"></span>
        <span class="metric-pct">--%</span>
      </div>
      <div class="metric-sub">reset --</div>
    </div>
    <div class="metric" id="metric-7d">
      <div class="metric-row">
        <span class="metric-label">7d</span>
        <span class="metric-bar"></span>
        <span class="metric-pct">--%</span>
      </div>
      <div class="metric-sub">reset --</div>
    </div>
    <div class="term-footer">
      <span class="term-version" id="version"></span>
      <span class="term-status" id="status">loading…</span>
    </div>
  </div>
`

function levelClass(percent: number): string {
  if (percent > 80) return 'level-high'
  if (percent >= 50) return 'level-mid'
  return 'level-low'
}

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent))
}

function renderBar(percent: number): string {
  const clamped = clampPercent(percent)
  const filled = Math.round((clamped / 100) * BAR_WIDTH)
  const fillChars = '█'.repeat(filled)
  const emptyChars = '░'.repeat(BAR_WIDTH - filled)

  return (
    `<span class="bracket">[</span>` +
    `<span class="fill ${levelClass(clamped)}">${fillChars}</span>` +
    `<span class="empty">${emptyChars}</span>` +
    `<span class="bracket">]</span>`
  )
}

function formatResetTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function renderMetric(groupId: string, data: UsageWindow): void {
  const group = document.getElementById(groupId)
  if (!group) return

  const bar = group.querySelector<HTMLElement>('.metric-bar')
  const pct = group.querySelector<HTMLElement>('.metric-pct')
  const sub = group.querySelector<HTMLElement>('.metric-sub')

  const percent = clampPercent(data.utilization)
  if (bar) bar.innerHTML = renderBar(percent)
  if (pct) {
    pct.textContent = `${percent.toFixed(0)}%`
    pct.className = `metric-pct ${levelClass(percent)}`
  }
  if (sub) sub.textContent = `reset ${formatResetTime(data.resetsAt)}`
}

function setStatus(text: string, isError: boolean): void {
  const status = document.getElementById('status')
  if (!status) return
  status.textContent = text
  status.classList.toggle('is-error', isError)
}

function setStale(stale: boolean): void {
  document.getElementById('metric-5h')?.classList.toggle('is-stale', stale)
  document.getElementById('metric-7d')?.classList.toggle('is-stale', stale)
}

function applyState(state: UsageState): void {
  if (state.status === 'error') {
    setStatus(state.message, true)
    setStale(true)
    return
  }

  renderMetric('metric-5h', state.usage.fiveHour)
  renderMetric('metric-7d', state.usage.sevenDay)
  setStale(false)
  setStatus(`updated ${new Date().toLocaleTimeString('en-US')}`, false)
}

async function init(): Promise<void> {
  try {
    const version = await window.claudeUsage.getAppVersion()
    const versionEl = document.getElementById('version')
    if (versionEl) versionEl.textContent = `v${version}`
  } catch {
    // Version display is non-critical — ignore failures.
  }

  try {
    const state = await window.claudeUsage.getUsage()
    if (state) applyState(state)
  } catch (err) {
    setStatus((err as Error).message, true)
  }
}

window.claudeUsage.onUsageUpdated((state) => applyState(state))

document.getElementById('close-btn')?.addEventListener('click', () => {
  window.claudeUsage.closePopup()
})

void init()

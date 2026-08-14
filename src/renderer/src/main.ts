import './style.css'
import { POLL_INTERVAL_MS, type UsageState, type UsageWindow } from '../../shared/types'

const BAR_WIDTH = 16

const MASCOT = ['▐▛███▜▌', '▝▜█████▛▘', '▘▘ ▝▝'].join('\n')
const DEAD_MASCOT = ['▐█████▌', '▝▜X███X▛▘','▘▘ ▝▝'].join('\n')

const app = document.getElementById('app')

if (!app) {
  throw new Error('#app root element missing')
}

app.innerHTML = `
  <div class="terminal">
    <div class="term-drag"></div>
    <span class="term-title">Claude Usage</span>
    <button class="term-close" id="close-btn" title="Close">[x]</button>
    <pre class="mascot" id="mascot">${MASCOT}</pre>
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

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days >= 1) return `${days}d ${hours}h`
  if (hours >= 1) return `${hours}h ${minutes}m`
  if (minutes >= 1) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

const resetTimestamps: Record<'metric-5h' | 'metric-7d', string | null> = {
  'metric-5h': null,
  'metric-7d': null
}

const REFRESH_TRIGGER_COOLDOWN_MS = 10_000
let lastRefreshTrigger = 0

function requestRefresh(): void {
  const now = Date.now()
  if (now - lastRefreshTrigger < REFRESH_TRIGGER_COOLDOWN_MS) return
  lastRefreshTrigger = now
  window.claudeUsage.requestRefresh()
}

function updateCountdown(groupId: 'metric-5h' | 'metric-7d'): void {
  const group = document.getElementById(groupId)
  const sub = group?.querySelector<HTMLElement>('.metric-sub')
  const iso = resetTimestamps[groupId]
  if (!sub || !iso) return

  const remaining = new Date(iso).getTime() - Date.now()
  if (remaining <= 0) {
    sub.textContent = 'refreshing…'
    requestRefresh()
    return
  }

  sub.textContent = `reset in ${formatCountdown(remaining)}`
}

function renderMetric(groupId: 'metric-5h' | 'metric-7d', data: UsageWindow): void {
  const group = document.getElementById(groupId)
  if (!group) return

  const bar = group.querySelector<HTMLElement>('.metric-bar')
  const pct = group.querySelector<HTMLElement>('.metric-pct')

  const percent = clampPercent(data.utilization)
  if (bar) bar.innerHTML = renderBar(percent)
  if (pct) {
    pct.textContent = `${percent.toFixed(0)}%`
    pct.className = `metric-pct ${levelClass(percent)}`
  }

  resetTimestamps[groupId] = data.resetsAt
  updateCountdown(groupId)
}

let nextRefreshAt = Date.now() + POLL_INTERVAL_MS

function setStatus(text: string, isError: boolean): void {
  const status = document.getElementById('status')
  if (!status) return
  status.textContent = text
  status.classList.toggle('is-error', isError)
}

function updateRefreshStatus(): void {
  const status = document.getElementById('status')
  if (!status || status.classList.contains('is-error')) return
  const remaining = nextRefreshAt - Date.now()
  setStatus(`refresh in ${formatCountdown(Math.max(remaining, 0))}`, false)
}

function setStale(stale: boolean): void {
  document.getElementById('metric-5h')?.classList.toggle('is-stale', stale)
  document.getElementById('metric-7d')?.classList.toggle('is-stale', stale)
}

function updateMascot(isDead: boolean): void {
  const mascot = document.getElementById('mascot')
  if (mascot) mascot.textContent = isDead ? DEAD_MASCOT : MASCOT
}

function applyState(state: UsageState): void {
  nextRefreshAt = Date.now() + POLL_INTERVAL_MS

  if (state.status === 'error') {
    setStatus(state.message, true)
    setStale(true)
    return
  }

  renderMetric('metric-5h', state.usage.fiveHour)
  renderMetric('metric-7d', state.usage.sevenDay)
  updateMascot(state.usage.fiveHour.utilization >= 100 || state.usage.sevenDay.utilization >= 100)
  setStale(false)
  updateRefreshStatus()
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

setInterval(() => {
  updateCountdown('metric-5h')
  updateCountdown('metric-7d')
  updateRefreshStatus()
}, 1000)

window.claudeUsage.onUsageUpdated((state) => applyState(state))

document.getElementById('close-btn')?.addEventListener('click', () => {
  window.claudeUsage.closePopup()
})

void init()

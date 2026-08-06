import './style.css'
import type { UsageResponse, UsageWindow } from '../../shared/types'

const BAR_WIDTH = 16

// Terminal mascot in block characters — only shown during UI development,
// until real data arrives from the main process (see readOAuthToken()).
const MOCK_USAGE: UsageResponse = {
  fiveHour: {
    utilization: 42,
    resetsAt: new Date(Date.now() + 2 * 60 * 60 * 1000 + 14 * 60 * 1000).toISOString()
  },
  sevenDay: {
    utilization: 71,
    resetsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  }
}

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
    <div class="term-status" id="status">loading…</div>
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

function renderUsage(usage: UsageResponse, statusText: string): void {
  renderMetric('metric-5h', usage.fiveHour)
  renderMetric('metric-7d', usage.sevenDay)
  setStatus(statusText)
}

function setStatus(text: string): void {
  const status = document.getElementById('status')
  if (status) status.textContent = text
}

async function init(): Promise<void> {
  renderUsage(MOCK_USAGE, 'mock data · backend pending')

  try {
    const usage = await window.claudeUsage.getUsage()
    if (usage) renderUsage(usage, `updated ${new Date().toLocaleTimeString('en-US')}`)
  } catch (err) {
    setStatus(`error: ${(err as Error).message}`)
  }
}

window.claudeUsage.onUsageUpdated((usage) =>
  renderUsage(usage, `updated ${new Date().toLocaleTimeString('en-US')}`)
)

document.getElementById('close-btn')?.addEventListener('click', () => {
  window.claudeUsage.closePopup()
})

void init()

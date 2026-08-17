import './style.css'
import type { UsageState } from '../../shared/types'
import { setStatus, updateRefreshStatus, flashSynced, scheduleNextRefresh } from './statusLine'
import { renderMetric, updateMetricCountdowns, setMetricsStale } from './metrics'
import { MASCOT, updateMascot } from './mascot'

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

function applyState(state: UsageState): void {
  scheduleNextRefresh()

  if (state.status === 'error') {
    setStatus(state.message, true)
    setMetricsStale(true)
    return
  }

  renderMetric('metric-5h', state.usage.fiveHour)
  renderMetric('metric-7d', state.usage.sevenDay)
  updateMascot(state.usage.fiveHour.utilization >= 100 || state.usage.sevenDay.utilization >= 100)
  setMetricsStale(false)
  flashSynced()
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
  updateMetricCountdowns()
  updateRefreshStatus()
}, 1000)

window.claudeUsage.onUsageUpdated((state) => applyState(state))

document.getElementById('close-btn')?.addEventListener('click', () => {
  window.claudeUsage.closePopup()
})

void init()

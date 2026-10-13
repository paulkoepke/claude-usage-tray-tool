import './style.css'
import type { UsageState } from '../../shared/types'
import { setStatus, updateRefreshStatus, flashSynced, scheduleNextRefresh } from './statusLine'
import { renderMetric, renderExtraMetric, updateMetricCountdowns, setMetricsStale, setLocale } from './metrics'
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
    <div class="metric" id="metric-extra" hidden>
      <div class="metric-row">
        <span class="metric-label">$$</span>
        <span class="metric-bar"></span>
        <span class="metric-pct">--%</span>
      </div>
      <div class="metric-sub">-- / --</div>
    </div>
    <div class="term-footer">
      <div class="update-banner" id="update-banner" hidden>Update available! Restart to install.</div>
      <div class="term-footer-row">
        <span class="term-version" id="version"></span>
        <span class="term-status" id="status">loading…</span>
      </div>
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
  renderExtraMetric(state.usage.extraUsage)
  updateMascot(state.usage.fiveHour.utilization >= 100 || state.usage.sevenDay.utilization >= 100)
  setMetricsStale(false)
  flashSynced()
}

function showUpdateBanner(): void {
  const banner = document.getElementById('update-banner')
  if (banner) banner.hidden = false
}

async function init(): Promise<void> {
  try {
    setLocale(await window.claudeUsage.getLocale())
  } catch {
    // Falls back to the default locale — ignore failures.
  }

  try {
    const version = await window.claudeUsage.getAppVersion()
    const versionEl = document.getElementById('version')
    if (versionEl) versionEl.textContent = `v${version}`
  } catch {
    // Version display is non-critical — ignore failures.
  }

  try {
    // The update may have finished downloading before this window loaded.
    if (await window.claudeUsage.isUpdateReady()) showUpdateBanner()
  } catch {
    // Non-critical — ignore failures.
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

// Keep the window exactly as tall as the card — the transparent remainder of a
// fixed-size window would otherwise block clicks on whatever is behind it.
new ResizeObserver(() => {
  window.claudeUsage.resizePopup(Math.ceil(document.body.getBoundingClientRect().height))
}).observe(document.body)

document.getElementById('close-btn')?.addEventListener('click', () => {
  window.claudeUsage.closePopup()
})

window.claudeUsage.onUpdateReady(showUpdateBanner)

void init()

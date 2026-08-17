import type { UsageWindow } from '../../shared/types'
import { formatCountdown } from './statusLine'

const BAR_WIDTH = 16

const REFRESH_TRIGGER_COOLDOWN_MS = 10_000
// The server-side window doesn't necessarily roll over in the exact instant
// resets_at passes — asking right at that millisecond can still get the old,
// expired data back. Give it a couple of seconds before the first refresh
// attempt instead of firing immediately on expiry.
const EXPIRY_GRACE_MS = 2_000
let lastRefreshTrigger = 0

type MetricGroupId = 'metric-5h' | 'metric-7d'

const resetTimestamps: Record<MetricGroupId, string | null> = {
  'metric-5h': null,
  'metric-7d': null
}

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

function requestRefresh(): void {
  const now = Date.now()
  if (now - lastRefreshTrigger < REFRESH_TRIGGER_COOLDOWN_MS) return
  lastRefreshTrigger = now
  window.claudeUsage.requestRefresh()
}

function refreshingText(): string {
  const dotCount = 1 + (Math.floor(Date.now() / 1000) % 3)
  return `refreshing${'.'.repeat(dotCount)}${' '.repeat(3 - dotCount)}`
}

function updateCountdown(groupId: MetricGroupId): void {
  const group = document.getElementById(groupId)
  const sub = group?.querySelector<HTMLElement>('.metric-sub')
  const iso = resetTimestamps[groupId]
  if (!sub || !iso) return

  const remaining = new Date(iso).getTime() - Date.now()
  if (remaining <= 0) {
    sub.textContent = refreshingText()
    if (remaining <= -EXPIRY_GRACE_MS) requestRefresh()
    return
  }

  sub.textContent = `reset in ${formatCountdown(remaining)}`
}

export function updateMetricCountdowns(): void {
  updateCountdown('metric-5h')
  updateCountdown('metric-7d')
}

export function renderMetric(groupId: MetricGroupId, data: UsageWindow): void {
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

export function setMetricsStale(stale: boolean): void {
  document.getElementById('metric-5h')?.classList.toggle('is-stale', stale)
  document.getElementById('metric-7d')?.classList.toggle('is-stale', stale)
}

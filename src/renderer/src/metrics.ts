import type { ExtraUsage, UsageWindow } from '../../shared/types'
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
  if (percent >= 60) return 'level-mid'
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

// Packaged builds only ship the en-US Chromium locale, so the default locale is
// always English there — the main process hands us the OS locale instead.
let locale: string | undefined

export function setLocale(value: string): void {
  locale = value || undefined
}

// Weekday, date and time in the user's locale and local time zone.
function formatResetTitle(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date)
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
  const sub = group.querySelector<HTMLElement>('.metric-sub')
  if (sub) sub.title = formatResetTitle(data.resetsAt)
  updateCountdown(groupId)
}

function formatMoney(minor: number, extra: ExtraUsage): string {
  const amount = (minor / 10 ** extra.decimalPlaces).toFixed(extra.decimalPlaces)
  return extra.currency === 'USD' ? `$${amount}` : `${amount} ${extra.currency}`
}

export function renderExtraMetric(extra: ExtraUsage | undefined): void {
  const group = document.getElementById('metric-extra')
  if (!group) return

  group.hidden = !extra
  if (!extra) return

  // Shown on manual override even without a limit — nothing to measure against then.
  const hasLimit = extra.limitMinor !== null && extra.limitMinor > 0
  const percent = hasLimit ? clampPercent((extra.usedMinor / extra.limitMinor!) * 100) : 0
  const bar = group.querySelector<HTMLElement>('.metric-bar')
  const pct = group.querySelector<HTMLElement>('.metric-pct')
  const sub = group.querySelector<HTMLElement>('.metric-sub')

  if (bar) bar.innerHTML = renderBar(percent)
  if (pct) {
    pct.textContent = hasLimit ? `${percent.toFixed(0)}%` : '--%'
    pct.className = `metric-pct ${levelClass(percent)}`
  }
  if (sub) {
    sub.textContent = hasLimit
      ? `${formatMoney(extra.usedMinor, extra)} / ${formatMoney(extra.limitMinor!, extra)}`
      : 'no limit set'
  }
}

export function setMetricsStale(stale: boolean): void {
  document.getElementById('metric-5h')?.classList.toggle('is-stale', stale)
  document.getElementById('metric-7d')?.classList.toggle('is-stale', stale)
  document.getElementById('metric-extra')?.classList.toggle('is-stale', stale)
}

import { POLL_INTERVAL_MS } from '../../shared/types'

const FLASH_HOLD_MS = 900
const FLASH_FADE_MS = 400

let nextRefreshAt = Date.now() + POLL_INTERVAL_MS
let flashHoldTimeoutId: ReturnType<typeof setTimeout> | null = null
let flashFadeTimeoutId: ReturnType<typeof setTimeout> | null = null

export function formatCountdown(ms: number): string {
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

function clearFlashTimers(): void {
  if (flashHoldTimeoutId) clearTimeout(flashHoldTimeoutId)
  if (flashFadeTimeoutId) clearTimeout(flashFadeTimeoutId)
  flashHoldTimeoutId = null
  flashFadeTimeoutId = null
}

// Marks the moment a poll cycle starts, so updateRefreshStatus() knows when
// the next one is due.
export function scheduleNextRefresh(): void {
  nextRefreshAt = Date.now() + POLL_INTERVAL_MS
}

export function setStatus(text: string, isError: boolean): void {
  const status = document.getElementById('status')
  if (!status) return
  clearFlashTimers()
  status.classList.remove('is-synced')
  status.textContent = text
  status.classList.toggle('is-error', isError)
}

export function updateRefreshStatus(): void {
  const status = document.getElementById('status')
  if (!status || status.classList.contains('is-error') || status.classList.contains('is-synced')) return
  const remaining = nextRefreshAt - Date.now()
  setStatus(`refresh in ${formatCountdown(Math.max(remaining, 0))}`, false)
}

// Briefly flashes the status line green on a successful refresh so a data
// update is visible even if you're not staring at the percentages.
export function flashSynced(): void {
  const status = document.getElementById('status')
  if (!status) return
  clearFlashTimers()
  status.classList.remove('is-error')
  status.textContent = '✓ synced'
  status.classList.add('is-synced')
  flashHoldTimeoutId = setTimeout(() => {
    status.classList.remove('is-synced')
    flashFadeTimeoutId = setTimeout(() => {
      updateRefreshStatus()
    }, FLASH_FADE_MS)
  }, FLASH_HOLD_MS)
}

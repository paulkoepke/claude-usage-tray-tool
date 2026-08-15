import type { UsageState } from '../shared/types'

// The renderer asks for an extra poll whenever a window's countdown hits
// zero, which can happen well before the server has actually rolled
// resets_at forward — either because of a transient endpoint error or
// because the server itself lags behind the timestamp it originally handed
// out. Retrying on a fixed short interval forever would either hammer the
// endpoint past its documented 180s budget (see CLAUDE.md) or, if throttled
// too hard, leave the UI stuck on "refreshing…" for a full 180s even for a
// few seconds of server lag. Instead: allow a handful of quick retries to
// ride out a brief lag, then give up on the fast path and fall back to the
// regular poll interval, which will pick up the real value once the server
// catches up.
export const QUICK_RETRY_INTERVAL_MS = 20_000
export const MAX_QUICK_RETRIES = 5

export function isStaleState(state: UsageState, now: number = Date.now()): boolean {
  if (state.status === 'error') return true
  return (
    new Date(state.usage.fiveHour.resetsAt).getTime() <= now ||
    new Date(state.usage.sevenDay.resetsAt).getTime() <= now
  )
}

/**
 * Bounds how often an IPC-triggered "countdown expired" refresh is allowed
 * to actually poll. Manual "Refresh now" clicks and the regular poll timer
 * bypass this entirely — it only gates the auto-refresh channel.
 */
export class QuickRetryBudget {
  private lastPollAt = 0
  private retryCount = 0

  recordPollAttempt(now: number): void {
    this.lastPollAt = now
  }

  recordPollResult(state: UsageState, now: number = Date.now()): void {
    this.retryCount = isStaleState(state, now) ? Math.min(this.retryCount + 1, MAX_QUICK_RETRIES) : 0
  }

  canTriggerRefresh(now: number): boolean {
    if (this.retryCount >= MAX_QUICK_RETRIES) return false
    return now - this.lastPollAt >= QUICK_RETRY_INTERVAL_MS
  }

  get exhausted(): boolean {
    return this.retryCount >= MAX_QUICK_RETRIES
  }

  get attempts(): number {
    return this.retryCount
  }
}

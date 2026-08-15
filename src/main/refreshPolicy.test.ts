import { describe, expect, it } from 'vitest'
import { QuickRetryBudget, isStaleState, MAX_QUICK_RETRIES, QUICK_RETRY_INTERVAL_MS } from './refreshPolicy'
import type { UsageState } from '../shared/types'

function errorState(message = 'boom'): UsageState {
  return { status: 'error', message }
}

function okState(now: number, overrides?: { fiveHourResetsAt?: number; sevenDayResetsAt?: number }): UsageState {
  return {
    status: 'ok',
    usage: {
      fiveHour: { utilization: 10, resetsAt: new Date(overrides?.fiveHourResetsAt ?? now + 3_600_000).toISOString() },
      sevenDay: { utilization: 10, resetsAt: new Date(overrides?.sevenDayResetsAt ?? now + 86_400_000).toISOString() }
    }
  }
}

describe('isStaleState', () => {
  it('treats an error state as stale', () => {
    expect(isStaleState(errorState(), Date.now())).toBe(true)
  })

  it('treats an ok state as stale when the 5h window has already reset', () => {
    const now = Date.now()
    expect(isStaleState(okState(now, { fiveHourResetsAt: now - 1_000 }), now)).toBe(true)
  })

  it('treats an ok state as stale when the 7d window has already reset', () => {
    const now = Date.now()
    expect(isStaleState(okState(now, { sevenDayResetsAt: now - 1_000 }), now)).toBe(true)
  })

  it('treats an ok state with both windows in the future as fresh', () => {
    const now = Date.now()
    expect(isStaleState(okState(now), now)).toBe(false)
  })
})

describe('QuickRetryBudget', () => {
  // A stuck/expired countdown triggers a refresh: right after a poll, an
  // immediate trigger is throttled...
  it('does not allow a triggered refresh immediately after a poll', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    const budget = new QuickRetryBudget()
    budget.recordPollAttempt(now)

    expect(budget.canTriggerRefresh(now)).toBe(false)
  })

  // ...but is allowed once the quick-retry interval (the "wait a bit before
  // retrying" window) has actually elapsed.
  it('allows a triggered refresh once the quick-retry interval has elapsed since the last poll', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    const budget = new QuickRetryBudget()
    budget.recordPollAttempt(now)

    expect(budget.canTriggerRefresh(now + QUICK_RETRY_INTERVAL_MS - 1)).toBe(false)
    expect(budget.canTriggerRefresh(now + QUICK_RETRY_INTERVAL_MS)).toBe(true)
  })

  it(`retries up to ${MAX_QUICK_RETRIES} times, spaced ${QUICK_RETRY_INTERVAL_MS}ms apart, while every poll keeps failing`, () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z')
    const budget = new QuickRetryBudget()

    for (let i = 0; i < MAX_QUICK_RETRIES; i++) {
      const t = start + i * QUICK_RETRY_INTERVAL_MS
      expect(budget.canTriggerRefresh(t)).toBe(true)
      budget.recordPollAttempt(t)
      budget.recordPollResult(errorState(), t)
    }

    expect(budget.attempts).toBe(MAX_QUICK_RETRIES)
    expect(budget.exhausted).toBe(true)
  })

  it('stops allowing triggered refreshes once the retry budget is exhausted, no matter how long it waits', () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z')
    const budget = new QuickRetryBudget()

    for (let i = 0; i < MAX_QUICK_RETRIES; i++) {
      const t = start + i * QUICK_RETRY_INTERVAL_MS
      budget.recordPollAttempt(t)
      budget.recordPollResult(errorState(), t)
    }
    expect(budget.exhausted).toBe(true)

    // Plenty of time has passed since the last poll — normally enough to
    // trigger again — but the budget is spent, so it stays blocked. Only the
    // regular (much slower) poll timer, which doesn't go through this gate,
    // will try again from here.
    const muchLater = start + 100 * QUICK_RETRY_INTERVAL_MS
    expect(budget.canTriggerRefresh(muchLater)).toBe(false)
  })

  it('resets the retry budget once a poll comes back with fresh (non-stale) data', () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z')
    const budget = new QuickRetryBudget()

    for (let i = 0; i < MAX_QUICK_RETRIES; i++) {
      const t = start + i * QUICK_RETRY_INTERVAL_MS
      budget.recordPollAttempt(t)
      budget.recordPollResult(errorState(), t)
    }
    expect(budget.exhausted).toBe(true)

    const recoveryAt = start + MAX_QUICK_RETRIES * QUICK_RETRY_INTERVAL_MS
    budget.recordPollAttempt(recoveryAt)
    budget.recordPollResult(okState(recoveryAt), recoveryAt)

    expect(budget.exhausted).toBe(false)
    expect(budget.attempts).toBe(0)
    expect(budget.canTriggerRefresh(recoveryAt + QUICK_RETRY_INTERVAL_MS)).toBe(true)
  })
})

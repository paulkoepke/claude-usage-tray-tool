import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageState, UsageWindow } from '../../shared/types'

function makeOkState(overrides?: {
  fiveHour?: Partial<UsageWindow>
  sevenDay?: Partial<UsageWindow>
}): UsageState {
  return {
    status: 'ok',
    usage: {
      fiveHour: {
        utilization: 37,
        resetsAt: new Date(Date.now() + 3_600_000).toISOString(),
        ...overrides?.fiveHour
      },
      sevenDay: {
        utilization: 26,
        resetsAt: new Date(Date.now() + 86_400_000).toISOString(),
        ...overrides?.sevenDay
      }
    }
  }
}

function makeErrorState(message: string): UsageState {
  return { status: 'error', message }
}

/**
 * Sets up window.claudeUsage and freshly imports main.ts (which builds the DOM
 * and wires up onUsageUpdated as a side effect of import).
 */
async function loadApp(
  options?: { version?: string; initialUsage?: UsageState | null; initialUsageError?: string }
): Promise<{ pushUpdate: (state: UsageState) => void }> {
  document.body.innerHTML = '<div id="app"></div>'

  let pushUpdate: (state: UsageState) => void = () => {}

  window.claudeUsage = {
    getUsage: options?.initialUsageError
      ? vi.fn().mockRejectedValue(new Error(options.initialUsageError))
      : vi.fn().mockResolvedValue(options?.initialUsage ?? null),
    onUsageUpdated: vi.fn((callback: (state: UsageState) => void) => {
      pushUpdate = callback
      return () => {}
    }),
    requestRefresh: vi.fn(),
    closePopup: vi.fn(),
    getAppVersion: vi.fn().mockResolvedValue(options?.version ?? '1.0.0')
  }

  vi.resetModules()
  await import('./main')

  // Flush pending microtasks so init()'s awaited getAppVersion()/getUsage()
  // calls settle before the caller starts asserting on the DOM.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()

  return { pushUpdate }
}

describe('applyState error recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('clears the error message and is-error class once a fresh successful poll arrives', async () => {
    const { pushUpdate } = await loadApp()

    pushUpdate(makeErrorState('Token expired — please log in again via Claude Code'))

    const status = document.getElementById('status')
    expect(status?.classList.contains('is-error')).toBe(true)
    expect(status?.textContent).toBe('Token expired — please log in again via Claude Code')

    pushUpdate(makeOkState())

    expect(status?.classList.contains('is-error')).toBe(false)
    expect(status?.textContent).not.toBe('Token expired — please log in again via Claude Code')
    expect(status?.textContent).toMatch(/^refresh in /)
  })

  it('also un-stales the metric bars after recovering from an error', async () => {
    const { pushUpdate } = await loadApp()

    pushUpdate(makeErrorState('No Claude Code login found — sign in via Claude Code first'))
    expect(document.getElementById('metric-5h')?.classList.contains('is-stale')).toBe(true)

    pushUpdate(makeOkState())
    expect(document.getElementById('metric-5h')?.classList.contains('is-stale')).toBe(false)
    expect(document.getElementById('metric-7d')?.classList.contains('is-stale')).toBe(false)
  })

  it('shows the error message but keeps the last known data on screen when a poll fails after data was already showing', async () => {
    const { pushUpdate } = await loadApp()

    pushUpdate(
      makeOkState({
        fiveHour: { utilization: 42, resetsAt: new Date(Date.now() + 3_600_000).toISOString() },
        sevenDay: { utilization: 17 }
      })
    )
    expect(document.querySelector('#metric-5h .metric-pct')?.textContent).toBe('42%')
    expect(document.querySelector('#metric-7d .metric-pct')?.textContent).toBe('17%')
    expect(document.querySelector('#metric-5h .metric-sub')?.textContent).toMatch(/^reset in /)

    pushUpdate(makeErrorState('Usage endpoint responded with status 500'))

    const status = document.getElementById('status')
    expect(status?.classList.contains('is-error')).toBe(true)
    expect(status?.textContent).toBe('Usage endpoint responded with status 500')

    // The last known numbers stay on screen, untouched, just marked stale —
    // applyState() skips renderMetric() entirely on an error state.
    expect(document.querySelector('#metric-5h .metric-pct')?.textContent).toBe('42%')
    expect(document.querySelector('#metric-7d .metric-pct')?.textContent).toBe('17%')
    expect(document.querySelector('#metric-5h .metric-sub')?.textContent).toMatch(/^reset in /)
    expect(document.getElementById('metric-5h')?.classList.contains('is-stale')).toBe(true)
    expect(document.getElementById('metric-7d')?.classList.contains('is-stale')).toBe(true)
  })
})

describe('happy path rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('shows the loading skeleton before any usage data has arrived', async () => {
    await loadApp()

    expect(document.getElementById('status')?.textContent).toBe('loading…')
    expect(
      document.querySelector('#metric-5h .metric-pct')?.textContent
    ).toBe('--%')
    expect(
      document.querySelector('#metric-7d .metric-pct')?.textContent
    ).toBe('--%')
    expect(document.querySelector('#metric-5h .metric-sub')?.textContent).toBe('reset --')
    expect(document.querySelector('#metric-7d .metric-sub')?.textContent).toBe('reset --')
  })

  it('renders the resolved app version', async () => {
    await loadApp({ version: '1.2.3' })

    expect(document.getElementById('version')?.textContent).toBe('v1.2.3')
  })

  it('renders percentage text and the matching threshold color class', async () => {
    const { pushUpdate } = await loadApp()

    pushUpdate(makeOkState({ fiveHour: { utilization: 30 } }))
    let pct = document.querySelector('#metric-5h .metric-pct')
    expect(pct?.textContent).toBe('30%')
    expect(pct?.classList.contains('level-low')).toBe(true)
    // 30% of a 16-char bar rounds to 5 filled chars.
    expect(document.querySelector('#metric-5h .metric-bar .fill')?.textContent).toBe('█████')

    pushUpdate(makeOkState({ fiveHour: { utilization: 65 } }))
    pct = document.querySelector('#metric-5h .metric-pct')
    expect(pct?.textContent).toBe('65%')
    expect(pct?.classList.contains('level-mid')).toBe(true)

    pushUpdate(makeOkState({ fiveHour: { utilization: 90 } }))
    pct = document.querySelector('#metric-5h .metric-pct')
    expect(pct?.textContent).toBe('90%')
    expect(pct?.classList.contains('level-high')).toBe(true)
  })

  it('formats the reset countdown from resetsAt', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { pushUpdate } = await loadApp()

    pushUpdate(
      makeOkState({
        fiveHour: { resetsAt: new Date('2026-01-01T02:30:00Z').toISOString() }
      })
    )
    expect(document.querySelector('#metric-5h .metric-sub')?.textContent).toBe('reset in 2h 30m')

    pushUpdate(
      makeOkState({
        fiveHour: { resetsAt: new Date('2026-01-02T03:00:00Z').toISOString() }
      })
    )
    expect(document.querySelector('#metric-5h .metric-sub')?.textContent).toBe('reset in 1d 3h')
  })

  it('shows the dead mascot only once a window reaches 100% utilization', async () => {
    const { pushUpdate } = await loadApp()
    const mascot = document.getElementById('mascot')
    const aliveText = mascot?.textContent

    pushUpdate(makeOkState({ fiveHour: { utilization: 80 } }))
    expect(mascot?.textContent).toBe(aliveText)
    expect(mascot?.textContent).not.toContain('X')

    pushUpdate(makeOkState({ fiveHour: { utilization: 100 } }))
    expect(mascot?.textContent).not.toBe(aliveText)
    expect(mascot?.textContent).toContain('X')
  })

  it('closes the popup when the close button is clicked', async () => {
    await loadApp()

    document.getElementById('close-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(window.claudeUsage.closePopup).toHaveBeenCalledTimes(1)
  })
})

describe('auto-refresh on expired countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('shows "refreshing…" as soon as the countdown hits zero, but does not request a refresh yet', async () => {
    const { pushUpdate } = await loadApp()
    const now = Date.now()

    pushUpdate(makeOkState({ fiveHour: { resetsAt: new Date(now + 1_000).toISOString() } }))

    vi.advanceTimersByTime(1_000)

    expect(document.querySelector('#metric-5h .metric-sub')?.textContent).toMatch(/^refreshing/)
    expect(window.claudeUsage.requestRefresh).not.toHaveBeenCalled()
  })

  it('waits ~2 seconds after expiry before requesting a refresh, to give the server time to roll the window over', async () => {
    const { pushUpdate } = await loadApp()
    const now = Date.now()

    // Countdown hits zero at t=3000ms.
    pushUpdate(makeOkState({ fiveHour: { resetsAt: new Date(now + 3_000).toISOString() } }))

    // t=4000ms: 1s past expiry, still inside the 2s grace period.
    vi.advanceTimersByTime(4_000)
    expect(window.claudeUsage.requestRefresh).not.toHaveBeenCalled()

    // t=5000ms: 2s past expiry — the grace period has elapsed.
    vi.advanceTimersByTime(1_000)
    expect(window.claudeUsage.requestRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('initial load from the main process', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('shows an already-known error state immediately, without waiting for a push', async () => {
    await loadApp({
      initialUsage: makeErrorState('Token expired — sign in again in Claude Code')
    })

    const status = document.getElementById('status')
    expect(status?.classList.contains('is-error')).toBe(true)
    expect(status?.textContent).toBe('Token expired — sign in again in Claude Code')
  })

  it('surfaces an error when the initial usage IPC call itself fails', async () => {
    await loadApp({ initialUsageError: 'IPC channel error' })

    const status = document.getElementById('status')
    expect(status?.classList.contains('is-error')).toBe(true)
    expect(status?.textContent).toBe('IPC channel error')
  })
})

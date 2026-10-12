import { describe, expect, it } from 'vitest'
import type { ExtraUsage, UsageState } from '../shared/types'
import { applyExtraPreference, isExtraRowVisible } from './extraUsagePreference'

const extra = (overrides?: Partial<ExtraUsage>): ExtraUsage => ({
  enabled: true,
  usedMinor: 500,
  limitMinor: 4000,
  currency: 'USD',
  decimalPlaces: 2,
  ...overrides
})

const okState = (extraUsage?: ExtraUsage): UsageState => ({
  status: 'ok',
  usage: {
    fiveHour: { utilization: 1, resetsAt: '2026-01-01T00:00:00Z' },
    sevenDay: { utilization: 2, resetsAt: '2026-01-02T00:00:00Z' },
    ...(extraUsage && { extraUsage })
  }
})

describe('isExtraRowVisible', () => {
  it('follows the API when there is no manual choice', () => {
    expect(isExtraRowVisible(undefined, extra())).toBe(true)
    expect(isExtraRowVisible(undefined, extra({ enabled: false }))).toBe(false)
    expect(isExtraRowVisible(undefined, extra({ limitMinor: null }))).toBe(false)
    expect(isExtraRowVisible(undefined, undefined)).toBe(false)
  })

  it('lets the manual choice win over is_enabled', () => {
    expect(isExtraRowVisible(false, extra())).toBe(false)
    expect(isExtraRowVisible(true, extra({ enabled: false }))).toBe(true)
  })
})

describe('applyExtraPreference', () => {
  it('strips extraUsage when hidden', () => {
    const result = applyExtraPreference(okState(extra()), false)
    expect(result?.status === 'ok' && result.usage.extraUsage).toBeUndefined()
  })

  it('keeps extraUsage when shown', () => {
    const result = applyExtraPreference(okState(extra()), undefined)
    expect(result?.status === 'ok' && result.usage.extraUsage?.limitMinor).toBe(4000)
  })

  it('shows a placeholder when forced on without API data', () => {
    const result = applyExtraPreference(okState(), true)
    expect(result?.status === 'ok' && result.usage.extraUsage?.limitMinor).toBeNull()
  })

  it('passes error states and null through', () => {
    const error: UsageState = { status: 'error', message: 'x' }
    expect(applyExtraPreference(error, true)).toBe(error)
    expect(applyExtraPreference(null, true)).toBeNull()
  })
})

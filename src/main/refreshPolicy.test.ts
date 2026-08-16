import { describe, expect, it } from 'vitest'
import { QuickRetryGate } from './refreshPolicy'

describe('QuickRetryGate', () => {
  it('does not allow a quick retry before any regular poll has armed it', () => {
    const gate = new QuickRetryGate()

    expect(gate.tryConsume()).toBe(false)
  })

  it('allows exactly one quick retry after being armed', () => {
    const gate = new QuickRetryGate()

    gate.armForRegularPoll()

    expect(gate.tryConsume()).toBe(true)
    expect(gate.tryConsume()).toBe(false)
    expect(gate.tryConsume()).toBe(false)
  })

  it('allows one more quick retry after being armed again', () => {
    const gate = new QuickRetryGate()

    gate.armForRegularPoll()
    expect(gate.tryConsume()).toBe(true)

    gate.armForRegularPoll()
    expect(gate.tryConsume()).toBe(true)
    expect(gate.tryConsume()).toBe(false)
  })
})

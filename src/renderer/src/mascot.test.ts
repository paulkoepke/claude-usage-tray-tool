import { describe, expect, it } from 'vitest'
import { MASCOT, DEAD_MASCOT, updateMascot } from './mascot'

describe('updateMascot', () => {
  it('shows the alive mascot by default and swaps in the dead mascot when isDead is true', () => {
    document.body.innerHTML = '<pre id="mascot"></pre>'
    const mascot = document.getElementById('mascot')

    updateMascot(false)
    expect(mascot?.textContent).toBe(MASCOT)

    updateMascot(true)
    expect(mascot?.textContent).toBe(DEAD_MASCOT)

    updateMascot(false)
    expect(mascot?.textContent).toBe(MASCOT)
  })

  it('does nothing when the #mascot element is missing', () => {
    document.body.innerHTML = ''

    expect(() => updateMascot(true)).not.toThrow()
  })
})

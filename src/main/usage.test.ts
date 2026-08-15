import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchUsage } from './usage'

function mockFetchResolvedWith(response: { ok: boolean; status?: number; body: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status ?? 200,
      json: () => Promise.resolve(response.body)
    })
  )
}

describe('fetchUsage error cases', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws when the endpoint responds with a non-ok status (e.g. revoked token)', async () => {
    mockFetchResolvedWith({ ok: false, status: 401, body: {} })

    await expect(fetchUsage('token')).rejects.toThrow('Usage endpoint responded with status 401')
  })

  it('throws when the response is missing five_hour', async () => {
    mockFetchResolvedWith({
      ok: true,
      body: { seven_day: { utilization: 10, resets_at: '2026-01-02T00:00:00Z' } }
    })

    await expect(fetchUsage('token')).rejects.toThrow('Unexpected response from usage endpoint')
  })

  it('throws when the response is missing seven_day', async () => {
    mockFetchResolvedWith({
      ok: true,
      body: { five_hour: { utilization: 10, resets_at: '2026-01-01T00:00:00Z' } }
    })

    await expect(fetchUsage('token')).rejects.toThrow('Unexpected response from usage endpoint')
  })

  it('propagates network failures unchanged (no special "no network" handling yet)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    await expect(fetchUsage('token')).rejects.toThrow('fetch failed')
  })
})

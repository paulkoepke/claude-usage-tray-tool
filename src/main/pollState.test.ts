import { afterEach, describe, expect, it, vi } from 'vitest'
import { readOAuthToken } from './token'
import { fetchUsage } from './usage'
import { resolveUsageState } from './pollState'

vi.mock('./token', () => ({ readOAuthToken: vi.fn() }))
vi.mock('./usage', () => ({ fetchUsage: vi.fn() }))

const readOAuthTokenMock = vi.mocked(readOAuthToken)
const fetchUsageMock = vi.mocked(fetchUsage)

describe('resolveUsageState', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('shows the "no login" message when no token is stored, without ever calling fetchUsage', async () => {
    readOAuthTokenMock.mockResolvedValue(null)

    await expect(resolveUsageState()).resolves.toEqual({
      status: 'error',
      message: 'No Claude Code login found — sign in via Claude Code first'
    })
    expect(fetchUsageMock).not.toHaveBeenCalled()
  })

  it('surfaces the token error message when reading the token throws (expired/corrupted credentials)', async () => {
    readOAuthTokenMock.mockRejectedValue(new Error('Token expired — sign in again in Claude Code'))

    await expect(resolveUsageState()).resolves.toEqual({
      status: 'error',
      message: 'Token expired — sign in again in Claude Code'
    })
    expect(fetchUsageMock).not.toHaveBeenCalled()
  })

  it('surfaces the usage-endpoint error message when a valid token is rejected by the API', async () => {
    readOAuthTokenMock.mockResolvedValue('valid-token')
    fetchUsageMock.mockRejectedValue(new Error('Usage endpoint responded with status 401'))

    await expect(resolveUsageState()).resolves.toEqual({
      status: 'error',
      message: 'Usage endpoint responded with status 401'
    })
  })

  it('passes the access token through to fetchUsage and returns its usage on success', async () => {
    const usage = {
      fiveHour: { utilization: 37, resetsAt: '2026-01-01T00:00:00Z' },
      sevenDay: { utilization: 26, resetsAt: '2026-01-02T00:00:00Z' }
    }
    readOAuthTokenMock.mockResolvedValue('valid-token')
    fetchUsageMock.mockResolvedValue(usage)

    await expect(resolveUsageState()).resolves.toEqual({ status: 'ok', usage })
    expect(fetchUsageMock).toHaveBeenCalledWith('valid-token')
  })
})

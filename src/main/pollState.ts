import { readOAuthToken } from './token'
import { fetchUsage } from './usage'
import type { UsageState } from '../shared/types'

/**
 * Maps a poll attempt (token lookup + usage fetch) to the UsageState shown in
 * the tray/popup — including which error message surfaces for which failure.
 */
export async function resolveUsageState(): Promise<UsageState> {
  try {
    const token = await readOAuthToken()
    if (!token) {
      return { status: 'error', message: 'No Claude Code login found — sign in via Claude Code first' }
    }
    return { status: 'ok', usage: await fetchUsage(token) }
  } catch (err) {
    return { status: 'error', message: (err as Error).message }
  }
}

import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CREDENTIALS_PATH = join(homedir(), '.claude', '.credentials.json')

interface StoredCredentials {
  claudeAiOauth?: {
    accessToken?: string
    expiresAt?: number
  }
}

/**
 * Reads the OAuth access token that Claude Code stores locally on login.
 * On Windows there is no Credential Manager entry — Claude Code writes
 * only the plaintext file at CREDENTIALS_PATH (verified, see CLAUDE.md
 * "Open Items" item 1).
 */
export async function readOAuthToken(): Promise<string | null> {
  let raw: string
  try {
    raw = await fs.readFile(CREDENTIALS_PATH, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }

  let credentials: StoredCredentials
  try {
    credentials = JSON.parse(raw) as StoredCredentials
  } catch {
    throw new Error('Credentials file is corrupted — sign in again in Claude Code')
  }

  const oauth = credentials.claudeAiOauth
  if (!oauth?.accessToken) return null

  if (oauth.expiresAt && oauth.expiresAt < Date.now()) {
    throw new Error('Token expired — sign in again in Claude Code')
  }

  return oauth.accessToken
}

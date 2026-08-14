import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const CREDENTIALS_PATH = join(homedir(), '.claude', '.credentials.json')

interface StoredCredentials {
  claudeAiOauth?: {
    accessToken?: string
    expiresAt?: number
  }
}

function parseCredentials(raw: string): { accessToken: string | null; expiresAt?: number } {
  let credentials: StoredCredentials
  try {
    credentials = JSON.parse(raw) as StoredCredentials
  } catch {
    throw new Error('Credentials file is corrupted — sign in again in Claude Code')
  }

  const oauth = credentials.claudeAiOauth
  return { accessToken: oauth?.accessToken ?? null, expiresAt: oauth?.expiresAt }
}

/**
 * Reads the OAuth access token that Claude Code stores locally on login.
 * On Windows there is no Credential Manager entry — Claude Code writes
 * only the plaintext file at CREDENTIALS_PATH (verified, see CLAUDE.md
 * "Open Items" item 1). On macOS, Claude Code stores the credentials in
 * the Keychain instead (service name unverified — see
 * docs/macos-release-plan.md).
 */
export async function readOAuthToken(): Promise<string | null> {
  let accessToken: string | null
  let expiresAt: number | undefined

  if (process.platform === 'darwin') {
    let stdout: string
    try {
      ;({ stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-s',
        'Claude Code-credentials',
        '-w'
      ]))
    } catch {
      return null
    }

    const raw = stdout.trim()
    if (!raw) return null

    // The Keychain entry may store either the raw token or the same JSON
    // blob used on Windows — handle both until verified on a real Mac.
    if (raw.startsWith('{')) {
      ;({ accessToken, expiresAt } = parseCredentials(raw))
    } else {
      accessToken = raw
    }
  } else if (process.platform === 'win32') {
    let raw: string
    try {
      raw = await fs.readFile(CREDENTIALS_PATH, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }

    ;({ accessToken, expiresAt } = parseCredentials(raw))
  } else {
    return null
  }

  if (!accessToken) return null

  if (expiresAt && expiresAt < Date.now()) {
    throw new Error('Token expired — sign in again in Claude Code')
  }

  return accessToken
}

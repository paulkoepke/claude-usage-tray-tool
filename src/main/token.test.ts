import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { readOAuthToken } from './token'

vi.mock('fs', () => {
  const promises = { readFile: vi.fn() }
  return { promises, default: { promises } }
})

vi.mock('child_process', () => {
  const execFile = vi.fn()
  return { execFile, default: { execFile } }
})

const readFileMock = vi.mocked(fs.readFile)
const execFileMock = vi.mocked(execFile)

function mockExecFileCallback(err: Error | null, result?: { stdout: string; stderr: string }): void {
  execFileMock.mockImplementation(((...args: unknown[]) => {
    const callback = args[args.length - 1] as (e: Error | null, r?: { stdout: string; stderr: string }) => void
    callback(err, result)
  }) as unknown as typeof execFile)
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

describe('readOAuthToken error cases', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    setPlatform(originalPlatform)
    vi.resetAllMocks()
  })

  describe('windows (plaintext credentials file)', () => {
    beforeEach(() => setPlatform('win32'))

    it('returns null when the credentials file does not exist (no Claude Code login yet)', async () => {
      readFileMock.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }))

      await expect(readOAuthToken()).resolves.toBeNull()
    })

    it('rethrows unexpected filesystem errors instead of swallowing them', async () => {
      readFileMock.mockRejectedValue(Object.assign(new Error('permission denied'), { code: 'EACCES' }))

      await expect(readOAuthToken()).rejects.toThrow('permission denied')
    })

    it('throws when the credentials file contains invalid JSON', async () => {
      readFileMock.mockResolvedValue('not json')

      await expect(readOAuthToken()).rejects.toThrow(
        'Credentials file is corrupted — sign in again in Claude Code'
      )
    })

    it('throws when the stored token is past its expiresAt', async () => {
      readFileMock.mockResolvedValue(
        JSON.stringify({ claudeAiOauth: { accessToken: 'abc', expiresAt: Date.now() - 1_000 } })
      )

      await expect(readOAuthToken()).rejects.toThrow('Token expired — sign in again in Claude Code')
    })

    it('returns null when the file has no accessToken at all', async () => {
      readFileMock.mockResolvedValue(JSON.stringify({ claudeAiOauth: {} }))

      await expect(readOAuthToken()).resolves.toBeNull()
    })
  })

  describe('macOS (Keychain)', () => {
    beforeEach(() => setPlatform('darwin'))

    it('returns null when the Keychain has no matching entry', async () => {
      mockExecFileCallback(
        new Error(
          'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.'
        )
      )

      await expect(readOAuthToken()).resolves.toBeNull()
    })

    it('returns null when the Keychain entry is present but empty', async () => {
      mockExecFileCallback(null, { stdout: '  \n', stderr: '' })

      await expect(readOAuthToken()).resolves.toBeNull()
    })

    it('throws when the Keychain entry is a corrupted JSON blob', async () => {
      mockExecFileCallback(null, { stdout: '{not json', stderr: '' })

      await expect(readOAuthToken()).rejects.toThrow(
        'Credentials file is corrupted — sign in again in Claude Code'
      )
    })
  })

  describe('unsupported platform', () => {
    it('returns null instead of throwing on an unhandled platform (e.g. linux)', async () => {
      setPlatform('linux')

      await expect(readOAuthToken()).resolves.toBeNull()
    })
  })
})

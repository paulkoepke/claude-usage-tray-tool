import { promises as fs } from 'fs'
import type { ExtraUsage, UsageState } from '../shared/types'

const PLACEHOLDER: ExtraUsage = {
  enabled: false,
  usedMinor: 0,
  limitMinor: null,
  currency: 'USD',
  decimalPlaces: 2
}

/**
 * The user's manual choice (tray menu) wins over the API's `is_enabled`;
 * without a choice the row follows the API (enabled and a limit is set).
 */
export function isExtraRowVisible(
  override: boolean | undefined,
  extra: ExtraUsage | undefined
): boolean {
  return override ?? (!!extra?.enabled && extra.limitMinor !== null)
}

/** Returns the state as the popup should see it: `extraUsage` present = row shown. */
export function applyExtraPreference(
  state: UsageState | null,
  override: boolean | undefined
): UsageState | null {
  if (state?.status !== 'ok') return state

  const { extraUsage, ...rest } = state.usage
  if (!isExtraRowVisible(override, extraUsage)) return { status: 'ok', usage: rest }
  return { status: 'ok', usage: { ...rest, extraUsage: extraUsage ?? PLACEHOLDER } }
}

export async function loadExtraRowOverride(path: string): Promise<boolean | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(path, 'utf8')) as { showExtraRow?: unknown }
    return typeof parsed.showExtraRow === 'boolean' ? parsed.showExtraRow : undefined
  } catch {
    return undefined
  }
}

export async function saveExtraRowOverride(path: string, value: boolean): Promise<void> {
  await fs.writeFile(path, JSON.stringify({ showExtraRow: value }), 'utf8')
}

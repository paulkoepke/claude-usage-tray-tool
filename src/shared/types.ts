export interface UsageWindow {
  utilization: number
  resetsAt: string
}

export interface ExtraUsage {
  /** The API's `is_enabled` flag. */
  enabled: boolean
  /** Amounts are in minor units (e.g. cents), see `decimalPlaces`. */
  usedMinor: number
  limitMinor: number | null
  currency: string
  decimalPlaces: number
}

export interface UsageResponse {
  fiveHour: UsageWindow
  sevenDay: UsageWindow
  /** Raw from the API in the main process; the popup only gets it when the row should show. */
  extraUsage?: ExtraUsage
}

export type UsageState = { status: 'ok'; usage: UsageResponse } | { status: 'error'; message: string }

export const POLL_INTERVAL_MS = 180_000

export const USAGE_GET_CHANNEL = 'usage:get'
export const USAGE_UPDATED_CHANNEL = 'usage:updated'
export const USAGE_REFRESH_CHANNEL = 'usage:refresh'
export const POPUP_CLOSE_CHANNEL = 'popup:close'
export const APP_VERSION_GET_CHANNEL = 'app:version'
export const LOCALE_GET_CHANNEL = 'app:locale'
export const POPUP_RESIZE_CHANNEL = 'popup:resize'
export const UPDATE_READY_GET_CHANNEL = 'update:ready:get'
export const UPDATE_READY_CHANNEL = 'update:ready'

export interface UsageWindow {
  utilization: number
  resetsAt: string
}

export interface UsageResponse {
  fiveHour: UsageWindow
  sevenDay: UsageWindow
}

export type UsageState = { status: 'ok'; usage: UsageResponse } | { status: 'error'; message: string }

export const POLL_INTERVAL_MS = 180_000

export const USAGE_GET_CHANNEL = 'usage:get'
export const USAGE_UPDATED_CHANNEL = 'usage:updated'
export const USAGE_REFRESH_CHANNEL = 'usage:refresh'
export const POPUP_CLOSE_CHANNEL = 'popup:close'
export const APP_VERSION_GET_CHANNEL = 'app:version'

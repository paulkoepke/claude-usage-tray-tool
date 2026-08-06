export interface UsageWindow {
  utilization: number
  resetsAt: string
}

export interface UsageResponse {
  fiveHour: UsageWindow
  sevenDay: UsageWindow
}

export type UsageState = { status: 'ok'; usage: UsageResponse } | { status: 'error'; message: string }

export const USAGE_GET_CHANNEL = 'usage:get'
export const USAGE_UPDATED_CHANNEL = 'usage:updated'
export const POPUP_CLOSE_CHANNEL = 'popup:close'
export const APP_VERSION_GET_CHANNEL = 'app:version'

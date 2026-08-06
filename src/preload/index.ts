import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  USAGE_GET_CHANNEL,
  USAGE_UPDATED_CHANNEL,
  POPUP_CLOSE_CHANNEL,
  APP_VERSION_GET_CHANNEL,
  type UsageState
} from '../shared/types'

const api = {
  getUsage: (): Promise<UsageState | null> => ipcRenderer.invoke(USAGE_GET_CHANNEL),
  onUsageUpdated: (callback: (state: UsageState) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: UsageState): void => callback(state)
    ipcRenderer.on(USAGE_UPDATED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(USAGE_UPDATED_CHANNEL, listener)
  },
  closePopup: (): void => ipcRenderer.send(POPUP_CLOSE_CHANNEL),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(APP_VERSION_GET_CHANNEL)
}

contextBridge.exposeInMainWorld('claudeUsage', api)

export type ClaudeUsageApi = typeof api

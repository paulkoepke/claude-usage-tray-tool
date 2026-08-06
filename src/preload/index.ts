import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  USAGE_GET_CHANNEL,
  USAGE_UPDATED_CHANNEL,
  POPUP_CLOSE_CHANNEL,
  type UsageResponse
} from '../shared/types'

const api = {
  getUsage: (): Promise<UsageResponse | null> => ipcRenderer.invoke(USAGE_GET_CHANNEL),
  onUsageUpdated: (callback: (usage: UsageResponse) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, usage: UsageResponse): void => callback(usage)
    ipcRenderer.on(USAGE_UPDATED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(USAGE_UPDATED_CHANNEL, listener)
  },
  closePopup: (): void => ipcRenderer.send(POPUP_CLOSE_CHANNEL)
}

contextBridge.exposeInMainWorld('claudeUsage', api)

export type ClaudeUsageApi = typeof api

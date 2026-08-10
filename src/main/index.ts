import { join } from 'path'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray, screen } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readOAuthToken } from './token'
import { fetchUsage } from './usage'
import { renderProgressIcon } from './icon'
import {
  USAGE_GET_CHANNEL,
  USAGE_UPDATED_CHANNEL,
  POPUP_CLOSE_CHANNEL,
  APP_VERSION_GET_CHANNEL,
  type UsageState
} from '@shared/types'

const POLL_INTERVAL_MS = 180_000
const POPUP_WIDTH = 280 + 32 // card width + window padding
const POPUP_HEIGHT = 300
const RELEASES_URL = 'https://github.com/paulkoepke/claude-usage-tray-tool/releases/latest'

let tray: Tray | null = null
let popup: BrowserWindow | null = null
let pollTimer: NodeJS.Timeout | null = null
let lastUsage: UsageState | null = null
let updateAvailableVersion: string | null = null

async function poll(): Promise<void> {
  if (!tray) return

  let state: UsageState
  try {
    const token = await readOAuthToken()
    state = token
      ? { status: 'ok', usage: await fetchUsage(token) }
      : { status: 'error', message: 'No Claude Code login found — sign in via Claude Code first' }
  } catch (err) {
    state = { status: 'error', message: (err as Error).message }
  }

  lastUsage = state

  if (state.status === 'ok') {
    const percent = state.usage.fiveHour.utilization
    tray.setImage(await renderProgressIcon(percent))
    tray.setToolTip(
      `Claude Usage\n5h: ${state.usage.fiveHour.utilization.toFixed(0)}%\n7d: ${state.usage.sevenDay.utilization.toFixed(0)}%`
    )
  } else {
    tray.setToolTip(`Claude Usage: ${state.message}`)
  }

  popup?.webContents.send(USAGE_UPDATED_CHANNEL, state)
}

function createPopup(): BrowserWindow {
  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function getPopupPosition(): { x: number; y: number } {
  if (!tray || !popup) return { x: 0, y: 0 }

  const trayBounds = tray.getBounds()
  const popupBounds = popup.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const workArea = display.workArea

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - popupBounds.width / 2)
  let y = Math.round(trayBounds.y - popupBounds.height - 8)

  // Fallback if tray bounds are unknown (e.g. 0,0): dock to the bottom right.
  if (trayBounds.x === 0 && trayBounds.y === 0) {
    x = workArea.x + workArea.width - popupBounds.width - 12
    y = workArea.y + workArea.height - popupBounds.height - 12
  }

  x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - popupBounds.width)
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - popupBounds.height)

  return { x, y }
}

function showPopup(): void {
  if (!popup) return

  const { x, y } = getPopupPosition()
  popup.setPosition(x, y, false)
  popup.show()
  popup.focus()
}

function togglePopup(): void {
  if (!popup) return

  if (popup.isVisible()) {
    popup.hide()
    return
  }

  showPopup()
}

function buildContextMenu(): Menu {
  const autostartEnabled = app.getLoginItemSettings().openAtLogin

  return Menu.buildFromTemplate([
    ...(updateAvailableVersion
      ? [
          { label: 'New version available!', click: () => shell.openExternal(RELEASES_URL) },
          { type: 'separator' as const }
        ]
      : []),
    { label: 'Refresh now', click: () => void poll() },
    { label: 'Show/Hide', click: () => togglePopup() },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: autostartEnabled,
      click: () => {
        app.setLoginItemSettings({ openAtLogin: !autostartEnabled })
        tray?.setContextMenu(buildContextMenu())
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
}

async function createTray(): Promise<void> {
  tray = new Tray(await renderProgressIcon(0))
  tray.setToolTip('Claude Usage')
  tray.on('click', () => togglePopup())
  tray.setContextMenu(buildContextMenu())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showPopup())

  app.whenReady().then(async () => {
    ipcMain.handle(USAGE_GET_CHANNEL, () => lastUsage)
    ipcMain.handle(APP_VERSION_GET_CHANNEL, () => app.getVersion())
    ipcMain.on(POPUP_CLOSE_CHANNEL, () => popup?.hide())

    await createTray()
    popup = createPopup()
    popup.once('ready-to-show', () => showPopup())

    void poll()
    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS)

    if (app.isPackaged) {
      const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE
      autoUpdater.autoDownload = !isPortable

      autoUpdater.on('update-available', (info) => {
        if (!isPortable) return
        updateAvailableVersion = info.version
        tray?.setContextMenu(buildContextMenu())
      })

      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('Auto-update check failed:', err)
      })
    }
  }).catch((err) => {
    dialog.showErrorBox('Usage Tray Tool for Claude — startup failed', (err as Error).stack ?? String(err))
    app.quit()
  })

  app.on('window-all-closed', () => {
    // Tray-only app: don't quit when the popup is closed/hidden.
  })

  app.on('before-quit', () => {
    if (pollTimer) clearInterval(pollTimer)
  })
}

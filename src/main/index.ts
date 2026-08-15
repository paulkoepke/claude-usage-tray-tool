import { join } from 'path'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray, screen } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'
import { resolveUsageState } from './pollState'
import { renderProgressIcon } from './icon'
import { QuickRetryBudget, isStaleState } from './refreshPolicy'
import {
  USAGE_GET_CHANNEL,
  USAGE_UPDATED_CHANNEL,
  USAGE_REFRESH_CHANNEL,
  POPUP_CLOSE_CHANNEL,
  APP_VERSION_GET_CHANNEL,
  POLL_INTERVAL_MS,
  type UsageState
} from '../shared/types'

const POPUP_WIDTH = 280 + 32 // card width + window padding
const POPUP_HEIGHT = 300
const RELEASES_URL = 'https://github.com/paulkoepke/claude-usage-tray-tool/releases/latest'

let tray: Tray | null = null
let popup: BrowserWindow | null = null
let pollTimer: NodeJS.Timeout | null = null
let lastUsage: UsageState | null = null
let updateAvailableVersion: string | null = null
const quickRetryBudget = new QuickRetryBudget()

async function poll(): Promise<void> {
  if (!tray) return

  const previousStatus = lastUsage?.status
  const now = Date.now()
  quickRetryBudget.recordPollAttempt(now)
  const state = await resolveUsageState()
  lastUsage = state

  if (state.status === 'ok') {
    if (previousStatus === 'error') {
      log.info('Usage poll recovered after previous failure')
    }
    const percent = state.usage.fiveHour.utilization
    tray.setImage(await renderProgressIcon(percent))
    tray.setToolTip(
      `Claude Usage\n5h: ${state.usage.fiveHour.utilization.toFixed(0)}%\n7d: ${state.usage.sevenDay.utilization.toFixed(0)}%`
    )
  } else {
    log.warn(`Usage poll failed: ${state.message}`)
    tray.setToolTip(`Claude Usage: ${state.message}`)
  }

  const attemptsBefore = quickRetryBudget.attempts
  quickRetryBudget.recordPollResult(state, now)
  if (isStaleState(state, now)) {
    if (quickRetryBudget.exhausted) {
      log.warn('Usage data still stale after max quick retries — falling back to the regular poll interval')
    } else {
      log.info(`Usage data still stale (resets_at in the past or poll failed), quick retry ${quickRetryBudget.attempts}`)
    }
  } else if (attemptsBefore > 0) {
    log.info('Usage data no longer stale — quick-retry budget reset')
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
      label: `Start with ${process.platform === 'darwin' ? 'macOS' : 'Windows'}`,
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
    ipcMain.on(USAGE_REFRESH_CHANNEL, () => {
      if (quickRetryBudget.exhausted) {
        log.debug('Auto-refresh request ignored — quick-retry budget exhausted, waiting for the next scheduled poll')
        return
      }
      if (!quickRetryBudget.canTriggerRefresh(Date.now())) {
        log.debug('Auto-refresh request throttled — too soon since the last poll')
        return
      }
      log.info('Auto-refresh triggered by expired countdown')
      void poll()
    })

    // Initialize logging before the first poll so a failure there — or in any
    // step below — is captured, not just failures after this point.
    if (app.isPackaged) {
      log.initialize()
      log.transports.file.level = 'info'
    }

    await createTray()
    popup = createPopup()
    popup.once('ready-to-show', () => showPopup())

    void poll()
    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS)

    if (app.isPackaged) {
      autoUpdater.logger = log

      // Portable Windows builds can't self-replace, and unsigned macOS
      // builds can't pass Squirrel.Mac's signature check on install — both
      // cases only notify via the tray menu instead of auto-applying.
      const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE
      const autoApplyUpdates = process.platform === 'win32' && !isPortable
      autoUpdater.autoDownload = autoApplyUpdates

      // electron-updater's AppUpdater extends EventEmitter — an 'error' event with
      // no listener crashes the process (Node's default EventEmitter behavior).
      autoUpdater.on('error', (err) => {
        log.error('Auto-update error:', err)
      })

      autoUpdater.on('update-available', (info) => {
        log.info(`Update available: ${info.version}`)
        if (autoApplyUpdates) return
        updateAvailableVersion = info.version
        tray?.setContextMenu(buildContextMenu())
      })

      autoUpdater.on('update-not-available', (info) => {
        log.info(`No update available, current version ${info.version}`)
      })

      autoUpdater.on('update-downloaded', (info) => {
        log.info(`Update downloaded: ${info.version}, will install on quit`)
      })

      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        log.error('Auto-update check failed:', err)
      })
    }
  }).catch((err) => {
    log.error('Startup failed:', err)
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

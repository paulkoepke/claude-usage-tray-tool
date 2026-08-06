import { join } from 'path'
import { app, BrowserWindow, ipcMain, Menu, Tray, screen } from 'electron'
import { readOAuthToken } from './token'
import { fetchUsage } from './usage'
import { renderProgressIcon } from './icon'
import {
  USAGE_GET_CHANNEL,
  USAGE_UPDATED_CHANNEL,
  POPUP_CLOSE_CHANNEL,
  type UsageResponse
} from '../shared/types'

const POLL_INTERVAL_MS = 180_000
const POPUP_WIDTH = 280 + 32 // card width + window padding
const POPUP_HEIGHT = 300

let tray: Tray | null = null
let popup: BrowserWindow | null = null
let pollTimer: NodeJS.Timeout | null = null
let lastUsage: UsageResponse | null = null

async function poll(): Promise<void> {
  if (!tray) return

  try {
    const token = await readOAuthToken()
    if (!token) {
      tray.setToolTip('Claude Usage: no token found')
      return
    }

    const usage = await fetchUsage(token)
    lastUsage = usage
    const percent = Math.max(usage.fiveHour.utilization, usage.sevenDay.utilization)

    tray.setImage(await renderProgressIcon(percent))
    tray.setToolTip(
      `Claude Usage\n5h: ${usage.fiveHour.utilization.toFixed(0)}%\n7d: ${usage.sevenDay.utilization.toFixed(0)}%`
    )
    popup?.webContents.send(USAGE_UPDATED_CHANNEL, usage)
  } catch (err) {
    tray.setToolTip(`Claude Usage: fetch failed (${(err as Error).message})`)
  }
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

function togglePopup(): void {
  if (!popup) return

  if (popup.isVisible()) {
    popup.hide()
    return
  }

  const { x, y } = getPopupPosition()
  popup.setPosition(x, y, false)
  popup.show()
  popup.focus()
}

async function createTray(): Promise<void> {
  tray = new Tray(await renderProgressIcon(0))
  tray.setToolTip('Claude Usage')
  tray.on('click', () => togglePopup())

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Refresh now', click: () => void poll() },
    { label: 'Show/Hide', click: () => togglePopup() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setContextMenu(contextMenu)
}

app.whenReady().then(async () => {
  ipcMain.handle(USAGE_GET_CHANNEL, () => lastUsage)
  ipcMain.on(POPUP_CLOSE_CHANNEL, () => popup?.hide())

  await createTray()
  popup = createPopup()

  void poll()
  pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS)
})

app.on('window-all-closed', () => {
  // Tray-only app: don't quit when the popup is closed/hidden.
})

app.on('before-quit', () => {
  if (pollTimer) clearInterval(pollTimer)
})

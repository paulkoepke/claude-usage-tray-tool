# Usage Tray Tool for Claude

![Popup window](screenshots/screenshot-tool.png)
![Tray icon and tooltip](screenshots/screenshot-tray-icon.png)

A free, open-source Windows tool that shows your current Claude.ai /
Claude Code usage (5-hour and 7-day windows, Pro/Max subscription) right
on your desktop. It lives as an icon in the system tray and, on click,
opens a small always-on-top widget with the detailed usage breakdown.

> **Disclaimer:** This is an independent, unofficial hobby project. It is
> **not affiliated with, endorsed by, or supported by Anthropic** in any
> way. "Claude" and "Anthropic" are trademarks of Anthropic, PBC — used
> here only to describe compatibility. The app relies on an
> **undocumented, internal Anthropic endpoint** that is not a public API,
> may change or break at any time without notice, and could stop working
> or violate Anthropic's terms of service in the future. Use at your own
> risk — provided "as is", with no warranty of any kind. This tool does
> not send your data anywhere except directly to Anthropic's own API using
> your own existing credentials; nothing is collected, logged, or shared
> by the project itself.

## Features

- **Tray icon**: shows usage as a ring/bar (32x32), color-coded by
  threshold — green (<50%), yellow (50–80%), red (>80%)
- **Popup window**: click the tray icon to open a frameless, draggable
  window with two progress bars (5h / 7d), percentage, and reset time
- **Context menu** (right-click): "Refresh now", "Show/Hide", "Quit"
- Polls usage data automatically every 180 seconds

## Tech stack

- Electron (TypeScript), scaffolded with `electron-vite`
- `@napi-rs/canvas` — renders the tray icon in the main process
- Renderer: vanilla TypeScript (no framework), talks to the main process
  via `contextBridge` / IPC

## Data source

The app calls an **undocumented, internal Anthropic endpoint** (not an
official public API):

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <accessToken>
anthropic-beta: oauth-2025-04-20
```

The `accessToken` is reused from your existing local Claude Code login —
no separate sign-in required. On Windows it is stored in plaintext at
`%USERPROFILE%\.claude\.credentials.json`, which this app only reads
locally on your machine.

## Project structure

```
src/
  main/       # Electron main process (tray, icon rendering, token, polling)
  preload/    # contextBridge / IPC bridge to the renderer
  renderer/   # popup UI (vanilla TS, HTML, CSS)
  shared/     # shared types
resources/    # tray mascot (256x256 PNG)
build/        # app icon for installer/exe (1024x1024 PNG)
```

## Development

```bash
npm install
npm run dev         # electron-vite dev mode
npm run typecheck   # TypeScript checks (main + renderer)
npm run build       # production build
npm run dist:win    # Windows installer (NSIS) via electron-builder
```

## Screenshots

**Popup widget**

![Popup window](screenshots/screenshot-tool.png)

**On the desktop**

![Popup window on the desktop](screenshots/screenshot-desktop-tool.png)

**Tray icon & tooltip**

![Tray icon and tooltip](screenshots/screenshot-tray-icon.png)


## License

MIT — see [LICENSE](LICENSE).

# macOS Release Feasibility & Implementation Plan

## Context

The user wants to know whether "Usage Tray Tool for Claude" — currently a
Windows-only Electron tray app — could also be released for macOS.

Conclusion: **yes, it's feasible**, and most of the app is already
platform-agnostic (Electron's Tray/BrowserWindow/IPC APIs, the polling loop,
the icon-rendering pipeline via `@napi-rs/canvas`, and even the token-file
path construction in `src/main/token.ts`, which already uses `os.homedir()`
instead of a Windows-only env var). The gaps are narrow but real:

1. **Token storage differs by OS.** `src/main/token.ts` reads a plaintext
   `~/.claude/.credentials.json` file — verified Windows behavior (see
   CLAUDE.md "Open items" #1). On macOS, Claude Code's CLI stores the OAuth
   token in the **macOS Keychain** instead, under a service name that has
   not been verified against a real Mac. This is the biggest unknown and the
   main implementation risk (see below).
2. **No `mac:` build config exists yet** in `electron-builder.yml`, no
   darwin `asarUnpack` entries for `@napi-rs/canvas-darwin-*` (the prebuilt
   binaries themselves already ship as optional deps of `@napi-rs/canvas`,
   confirmed in `node_modules/@napi-rs/canvas/package.json`).
3. **No macOS build environment.** Apple's codesign/notarization tooling
   doesn't run on Windows, so a mac build can only be produced via a real
   Mac or a macOS CI runner.
4. One cosmetic string (`'Start with Windows'` menu label,
   `src/main/index.ts:141`) and one Windows-only env check
   (`PORTABLE_EXECUTABLE_FILE`, `src/main/index.ts:184`) need small
   platform-aware tweaks.

**Decisions already made:**
- **Unsigned build** — no Apple Developer Program membership, no
  notarization. Users will need to right-click → Open on first launch to
  bypass Gatekeeper. This fits the "private hobby tool" framing in
  CLAUDE.md.
- **Development and manual verification happen on the user's own MacBook**
  (not just in CI) — this resolves the biggest open risk below, since the
  Keychain service/account name and Gatekeeper/tray behavior can now be
  checked directly instead of guessed. **GitHub Actions (`macos-latest`)
  is still needed** for producing the actual release build/artifacts
  (`dist:mac`), same as the existing Windows release job — local Mac
  builds are for development/testing, CI is for shipping releases.

**Important risk to flag up front:** because unsigned, `electron-updater`'s
Squirrel.Mac-based auto-update mechanism will refuse to *apply* downloaded
updates (it validates the code signature before installing). The plan
below treats mac builds like today's Windows "portable" build: check for
updates and show a tray notification linking to the releases page, but
never auto-download/auto-install.

**Also flag:** the exact macOS Keychain service/account name Claude Code's
CLI uses hasn't been confirmed yet. The implementation starts with the
documented/most-likely value
(`security find-generic-password -s "Claude Code-credentials" -w`), but
this **needs to be checked on a real Mac** and corrected if the real
service/account name differs — see Verification section.

## Implementation

### 1. Cross-platform token reader — `src/main/token.ts`
Branch on `process.platform`:
- `win32` (current behavior, unchanged): read
  `~/.claude/.credentials.json`.
- `darwin`: shell out via `child_process.execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'])`
  to read the token from Keychain (stdout is the raw access token, or a JSON
  blob depending on how Claude Code stores it — needs on-Mac verification).
  Treat a non-zero exit / empty stdout the same as today's `ENOENT` case
  (return `null`, surfaced as "No Claude Code login found").
- Any other platform: return `null` with an "unsupported platform" style
  message, matching the existing early-return pattern.

Keep `readOAuthToken()`'s existing return contract (`string | null`, throws
on expired/corrupted) so `src/main/index.ts`'s `poll()` doesn't need to
change.

### 2. `electron-builder.yml`
Add a `mac:` block reusing the existing `build/icon.png` (electron-builder
auto-converts a 1024×1024 PNG to `.icns` when the build runs on macOS — no
manual `.icns` asset needed):
```yaml
mac:
  target:
    - dmg
    - zip
  icon: build/icon.png
  category: public.app-category.utilities
  hardenedRuntime: false
```
Add darwin unpack entries next to the existing win32 one:
```yaml
asarUnpack:
  - resources/**/*
  - node_modules/@napi-rs/canvas/**/*
  - node_modules/@napi-rs/canvas-win32-x64-msvc/**/*
  - node_modules/@napi-rs/canvas-darwin-x64/**/*
  - node_modules/@napi-rs/canvas-darwin-arm64/**/*
```

### 3. `package.json`
Add `"dist:mac": "npm run build && electron-builder --mac --publish never"`
next to the existing `dist:win` script.

### 4. `src/main/index.ts` platform-aware tweaks
- `buildContextMenu()`: change the hardcoded `'Start with Windows'` label
  (line 141) to `` `Start with ${process.platform === 'darwin' ? 'macOS' : 'Windows'}` ``.
- Auto-update block (lines 179–211): generalize the existing
  `isPortable` "notify-only" branch so it also covers `darwin`, e.g.
  `const autoApplyUpdates = process.platform === 'win32' && !isPortable`,
  and use that in place of `!isPortable` for both `autoUpdater.autoDownload`
  and the `update-available` handler's early return. This keeps Windows
  behavior identical and makes mac always notify-only (consistent with the
  unsigned-build decision).
- Leave `app.setLoginItemSettings` as-is — it's already cross-platform.

### 5. CI — `.github/workflows/build.yml`
Restructure from one Windows job into a version job + parallel per-OS build
jobs + a release job, so the mac build shares the same version bump/tag as
Windows instead of duplicating it:
- **`version`** (ubuntu-latest): run the existing tag-detection, version
  bump, commit, and push/tag steps. Output the new version string and tag.
- **`build-win`** (windows-latest, needs `version`): checkout at the new
  tag, `npm ci`, typecheck, build, `npm run dist:win`, upload `dist/*.exe`.
- **`build-mac`** (macos-latest, needs `version`): checkout at the new tag,
  `npm ci`, typecheck, build, `npm run dist:mac`, upload `dist/*.dmg` and
  `dist/*.zip`.
- **`release`** (needs `build-win`, `build-mac`): download both artifacts,
  generate the changelog (existing `git-cliff-action` step), create the
  GitHub release with all files (`dist/*.exe`, `dist/*.blockmap`,
  `dist/latest.yml`, `dist/*.dmg`, `dist/*.zip`, `dist/latest-mac.yml`).

### 6. Documentation
Update CLAUDE.md's "Open items" / data-source notes to record the macOS
Keychain token path once verified, and note the unsigned/notify-only
auto-update behavior on mac, so this isn't re-derived from scratch later.

## Verification

Two-stage rollout, split across the Windows dev machine and the Mac:
1. **Windows machine:** `npm run typecheck` and `npm run build` after the
   `token.ts`/`index.ts` changes, to confirm the cross-platform branches
   compile and don't break the Windows path. Cannot run the `darwin`
   branch or build the `.dmg`/`.zip` locally.
2. **Mac** (both during development and after pulling this doc / the
   `build-mac` CI artifacts):
   - Run `security find-generic-password -s "Claude Code-credentials" -w`
     (and variations, e.g. listing Keychain entries for "claude") against
     a real Claude Code login to confirm the actual service/account name,
     and correct `token.ts` if it differs from the guessed value.
   - `npm run dist:mac` locally (or download the CI artifact) to install
     the unsigned `.dmg`/`.zip`, confirm Gatekeeper's right-click → Open
     flow works, and the tray/menu bar icon appears correctly.
   - Confirm the tray popup, polling, and "Start with macOS" login item
     toggle work.
   - Confirm the update-notification (not auto-install) flow doesn't error.

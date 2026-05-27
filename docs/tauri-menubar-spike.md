# Pomotree Tauri Menubar

Pomotree has a v0 Tauri 2 macOS shell that reuses the web app instead of forking product logic.

## Entry points

- Web dashboard: `src/app/page.tsx`
- Menubar route: `src/app/menubar/page.tsx`
- Menubar UI: `src/app/menubar/MenubarApp.tsx`
- Native shell: `src-tauri/src/lib.rs`
- Tauri config: `src-tauri/tauri.conf.json`

## Commands

```bash
npm run tauri:dev
npm run tauri:dev:current
npm run tauri:build
```

- `npm run tauri:dev` starts `next dev` on port 3000 and opens `http://localhost:3000/menubar` in a compact Tauri window.
- `npm run tauri:dev:current` attaches Tauri to an already-running `http://localhost:3001/menubar` dev server.
- `npm run tauri:build` creates a macOS `.app` from a static Next export in `out`.

## Current behavior

- The menubar window is a compact, decoration-free popover sized around 380px wide.
- The React menubar UI dynamically adjusts the native window height to the current idle/running/paused/finishing content.
- Closing the compact window hides it instead of quitting.
- Reopening the app from Dock restores and focuses the existing hidden window.
- Left-clicking the tray/menu-bar icon toggles the compact window.
- Tray-click positioning uses Tauri's tray event rect when available and falls back to the cursor/primary monitor.
- The tray menu includes `Show Pomotree`, `Open Dashboard`, and `Quit Pomotree`; Cmd+Q remains a real quit path.
- `Open Dashboard` creates or focuses a separate resizable dashboard window.
- The menubar route supports idle start, running controls, pause/resume, interruption capture, finishing summary, and completed/partial save.
- The tray title is updated through the `set_menubar_status` command and shows compact status text such as remaining time, paused state, or completion state.

## Storage model

The app remains local-first and browser-storage based. The Tauri WebView has its own IndexedDB storage, separate from Safari/Chrome/Playwright browser profiles.

## Build model

Production packaging uses static export:

- `src-tauri/tauri.conf.json` sets `frontendDist` to `../out`.
- `beforeBuildCommand` runs `NEXT_OUTPUT=export npm run build`.
- `next.config.ts` enables `output: "export"` and `trailingSlash` only when `NEXT_OUTPUT=export`.

## Verified coverage

- `tests/e2e/menubar.spec.ts` covers the browser-rendered `/menubar` route: idle start, interruption capture, pause/resume, finish, and save.
- Native tray/window behavior still needs manual verification because Playwright does not exercise macOS tray events.

## Follow-ups

- App signing/notarization.
- Release distribution and auto-update.
- Optional global shortcut.
- Optional sound/haptic alert.
- Richer tray menu actions if the popover flow proves insufficient.

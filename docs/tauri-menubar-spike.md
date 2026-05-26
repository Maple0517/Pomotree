# Pomotree Tauri menubar spike

v0 uses the proven web route as the only UI:

- `npm run tauri:dev` starts `next dev` on port 3000 and opens `http://localhost:3000/menubar` in a compact Tauri window.
- `npm run tauri:dev:current` attaches Tauri to an already running `http://localhost:3001/menubar` dev server.
- `npm run tauri:build` creates a macOS `.app` from a static Next export in `out`.
- The window is 380x560, non-resizable, title-hidden where macOS supports it.
- Closing the compact window hides it instead of quitting.
- Reopening the app from Dock restores and focuses the existing hidden window.
- A static tray/menu-bar icon is configured for v0. Left-clicking it toggles the compact window. Dynamic timer text in the tray is follow-up.
- The tray menu includes `Show Pomotree` and `Quit Pomotree`; Cmd+Q remains a real quit path.

Production packaging uses the static export strategy. The app remains local-first and browser-storage based; the Tauri WebView has its own IndexedDB storage.

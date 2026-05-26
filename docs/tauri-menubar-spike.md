# Pomotree Tauri menubar spike

v0 uses the proven web route as the only UI:

- `npm run tauri:dev` starts `next dev` on port 3000 and opens `http://localhost:3000/menubar` in a compact Tauri window.
- `npm run tauri:build` is intentionally not wired to a production packaging command for v0.
- The window is 380x560, non-resizable, title-hidden where macOS supports it.
- Closing the compact window hides it instead of quitting.
- A static tray/menu-bar icon is configured for v0. Left-clicking it toggles the compact window. Dynamic timer text in the tray is follow-up.

Production packaging is intentionally not solved in this spike. The current Next app is local-first and dynamic, so no silent static-export migration or bundled local server was added. Choose static export or local-server packaging before enabling `tauri:build` as a supported release path.

# S1a prototype result — 9 October 2026

**Scope:** Local mock CLI in Electron on Windows 11. This is a prototype result, not a pass for the full S1 feasibility test.

| Check | Result | Evidence |
|---|---|---|
| TypeScript and bundle build | Pass | `rtk npm run check` completed (`tsc --noEmit` and esbuild) |
| Electron-hosted ConPTY channel | Pass | `rtk npm run smoke`: banner, ASCII and Unicode echo, resize, fast output, and clean exit |
| Renderer and preload bridge | Pass | `rtk npm run smoke:window`: renderer READY, terminal output rendered, and screenshot captured at `dist/smoke-shot.png` |

**Versions tested:** Windows 11 build 26300, Node.js 26.7.0, Electron 38.8.6, node-pty 1.1.0, xterm.js 5.5.0, TypeScript 5.9.3.

**Still required for S1:** Manual comparison with a real installed CLI; interactive approval, resize, multiline paste, Ctrl+C, and CJK/Arabic input checks; window-close choices 9a–9f, tray quit, core restart, process-tree cleanup, and the Windows job boundary. S6 WSL behavior remains untested. Keep S1 status **partial** until those checks are recorded.

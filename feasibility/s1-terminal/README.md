# TIYE S1a prototype — terminal display/input channel

S1a proves the Electron display/input channel (Architecture 2.1, 5.2) before
adding lifecycle and process-tree guarantees. Main owns the node-pty PTY; a
sandboxed renderer (context isolation on, sandbox on, Node integration off)
shows it with xterm.js through a narrow validated IPC/preload bridge
(terminal data in, input/resize out). Default child: the scripted local
`mock-cli` — never a vendor CLI, never a network model.

## Setup / run

```bat
cd feasibility\s1-terminal
npm install
npm run rebuild-pty     &:: optional if the node-pty prebuild does not load
npm run check           &:: typecheck + build
npm start               &:: visible window with mock-cli (manual S1 steps 1-8)
npm run smoke           &:: Electron headless PTY check (banner/echo/resize/exit)
npm run smoke:window    &:: hidden-window render check + dist/smoke-shot.png
```

Manual S1 launch override (no source edits) — a trusted local command only:

```bat
set TIYE_S1_COMMAND=C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
set TIYE_S1_ARGS_JSON=["-NoLogo"]
set TIYE_S1_CWD=D:\some\folder
npm start
```

Unset, the prototype runs `mock-cli/mock-cli.js` on Node (`node` from PATH
when hosted by Electron, else the current binary). Bare command names are
resolved via `where.exe` because node-pty's ConPTY backend does not search
PATH. `TIYE_S1_ARGS_JSON` is a JSON array, so paths and spaces stay intact.
Do not point this at a paid
vendor CLI in automated checks.

## S1 steps 1–8 checklist (manual, against the window)

| Step | Action in this prototype | Observe |
|---|---|---|
| 1 | `npm start`; mock-cli starts via node-pty | Starts without errors |
| 2 | Compare with `node mock-cli/mock-cli.js` in Windows Terminal | Colors, box, spinner match |
| 3 | Type `help`, use arrows/history, run `spinner 1500` | Editing keys + history work |
| 4 | Run `ask`, answer `y` then `n` | Prompt displays, answer accepted |
| 5 | Resize the window | Layout re-flows (fit + `term.resize`) |
| 6 | Run `multi`, paste several lines, end with empty line | Lines echoed back intact |
| 7 | Run `hang`, press Ctrl+C | `^C interrupted`, prompt returns |
| 8 | Run `unicode`, then type Arabic/CJK text | Wide chars display, uncorrupted |

`fast 200` gives a quick flood sanity check (not the S5 five-member test).

## Automated evidence (this machine, 2026-10-09)

- `npm run check` — `tsc --noEmit` + esbuild bundles: PASS.
- `npm run smoke` — Electron-hosted real ConPTY, same assertions: PASS.
- `npm run smoke:window` — hidden BrowserWindow, sandboxed renderer,
  preload bridge READY, graceful `exit` driven **through**
  `window.tiyeTerminal.sendInput`, PTY exit 0, non-empty screenshot:
  PASS (see `dist/smoke-shot.png` after a run).
- No vendor CLI and no network model were used in any automated check.

## Environment notes (exact failures / workarounds)

- **node-pty rebuild for Electron FAILED on this machine** (`npm run
  rebuild-pty` → `@electron/rebuild` → node-gyp): `Could not find any
  Visual Studio installation to use` — the "Desktop development with C++"
  workload is not installed. The prototype instead runs on node-pty 1.1.0's
  shipped `win32-x64` prebuild, which loads and drives ConPTY correctly
  under both plain Node 26 and Electron 38.8.6 here. Install VS Build
  Tools and re-run `npm run rebuild-pty` before treating this as release
  evidence.
- **Electron binary download stalled**: `electron/install.js`
  (`extract-zip`) hung after `dist/locales`, leaving a partial `dist/`
  with no `electron.exe` and no error. The cached
  `electron-v38.8.6-win32-x64.zip` verified fine; extraction via
  .NET `ZipFile::ExtractToDirectory` succeeded and `path.txt` was
  written manually. No prototype code depends on this.
- **node-pty teardown quirk (Windows)**: `term.kill()` on a live PTY, or
  `app.exit` with a live PTY, can crash the teardown with
  `conpty_console_list_agent.js: AttachConsole failed`. Automated checks
  exit the child gracefully first; window-close still uses `kill()`.
- Interactive window mode (`npm start`) was built and typechecked but not
  visually verified in this session; S1 steps 1–8 remain manual.

## NOT implemented / NOT passed in S1a

- S1 steps **9a–9f**: window-close keep/stop choices, tray quit (stop-all),
  core-restart re-subscribe without duplicate processes, Windows job
  ownership / durable process-identity registry, abnormal-main-exit
  cleanup. Closing the window currently kills the PTY.
- **WSL** cases (S6): not implemented or tested.
- No pass/fail claim for the full S1 test is made by this prototype.

## Layout

- `src/main.ts` — window + PTY ownership, launch resolution, IPC
  validation, `--smoke-test` / `--window-smoke`.
- `src/preload.ts`, `src/shared.ts` — narrow validated bridge + contract.
- `src/renderer.ts`, `src/index.html` — xterm.js view, no Node.
- `scripts/build.js` — esbuild bundles + asset copy.
- `scripts/run-smoke.js` — headless Electron runner (timeout + logs).
- `mock-cli/mock-cli.js` — scripted local CLI, zero dependencies.

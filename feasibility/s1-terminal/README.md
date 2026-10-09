# TIYE S1 terminal prototype — display/input channel + member lifecycle (S1a + S1b)

S1a proves the Electron display/input channel (Architecture 2.1, 5.2); S1b
adds a bounded member lifecycle exercise for parts of S1 steps 9a–9d. Main
owns ONE member PTY session across BrowserWindow recreation; a sandboxed
renderer (context isolation on, sandbox on, Node integration off) shows it
with xterm.js through a narrow validated IPC/preload bridge (terminal data
in, input/resize out). Default child: the scripted local `mock-cli` —
never a vendor CLI, never a network model.

Lifecycle behavior (interactive): closing the window while the member is
alive asks **Keep Running** or **Stop**. Keep Running retains the PTY and
exposes a tray menu with **Open** (new window, renderer reattaches to the
same PTY, no duplicate spawn) and **Quit**. Stop, and tray Quit, share one
stop-all path: graceful CLI shutdown is requested through the PTY (the
mock CLI's `exit` command — never a PID kill), then the app ends. A tiny
mock-core subscribe/unsubscribe token simulates 9b re-subscribe with no
second spawn; a real core process restart remains untested.
Output produced while no renderer is attached is buffered up to one million
characters and flushed on reopen; older output is dropped with a notice.
The prototype does not replay the full terminal history from before close.

## Setup / run

```bat
cd feasibility\s1-terminal
npm install
npm run rebuild-pty     &:: optional if the node-pty prebuild does not load
npm run check           &:: typecheck + build
npm start               &:: visible window with mock-cli (manual S1 steps 1-8)
npm run smoke           &:: Electron headless PTY check (banner/echo/resize/exit)
npm run smoke:window    &:: hidden-window render check + dist/smoke-shot.png
npm run smoke:lifecycle &:: S1 9a-9d lifecycle: Keep Running PID/session
                        &:: preserved through close+reopen, mock-core
                        &:: re-subscribe with no duplicate spawn, Stop and
                        &:: tray-Quit each request graceful shutdown
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
- `npm run smoke:lifecycle` — S1 9a–9d + 9b against the local mock CLI,
  driven by internal hooks (no dialog/tray clicks): 9a Keep Running keeps
  the same PTY PID/session identity through close (spawn # stays 1); Open
  sends input from the new window's renderer through the preload bridge
  (`echo: hello reopen` observed at the PTY, still spawn #1); 9b mock-core restart
  token re-subscribes to the same session with no second spawn; 9c Stop and 9d
  tray-Quit each request graceful shutdown and observe PTY exit 0: PASS.
  Exit 0 shows the CLI exited on request; it does **not** prove a whole
  process tree died (no Job Object in this task).
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
  app exit with a live PTY, can crash the teardown with
  `conpty_console_list_agent.js: AttachConsole failed`. Automated checks
  exit the child gracefully first. Interactive Stop/Quit likewise write
  `exit` through the PTY and wait; `term.kill()` is only a timeout
  fallback and is never cited as evidence of process-tree death.
- **Last-window-close ends the process unless handled**: while building
  the lifecycle smoke, closing the last window with no `window-all-closed`
  handler exited the app silently (code 0, ~1 s after `win.close()`),
  before any further smoke step ran. The handler (stay alive when a
  retained PTY/tray exists, else quit) is therefore registered before all
  modes, including smoke modes. This is smoke-observed behavior, not a
  claim about crash recovery.
- Interactive window mode (`npm start`) was built and typechecked but not
  visually verified in this session; S1 steps 1–8 remain manual.

## NOT implemented / NOT passed beyond S1a–S1b

- S1 steps **9e–9f**: orphan enumeration with PID + process-creation
  identity after 9c/9d, Windows job ownership / durable
  process-identity registry, abnormal-main-exit cleanup and crash
  recovery. A keep-running PTY from 9a is intentionally owned, not an
  orphan; nothing here proves a whole process tree died.
- Real installed CLIs: lifecycle paths are evidenced with the local
  mock CLI only; vendor-CLI behavior (permission prompts, resume, output
  patterns) is still manual per S1 steps 1–8.
- **WSL** cases (S6): not implemented or tested.
- No pass/fail claim for the full S1 test is made by this prototype.

## Layout

- `src/main.ts` — window + single main-owned PTY session, launch
  resolution, IPC validation, tray (Open/Quit), graceful stop-all,
  mock-core subscribe token, `--smoke-test` / `--window-smoke` /
  `--lifecycle-smoke`.
- `src/preload.ts`, `src/shared.ts` — narrow validated bridge + contract.
- `src/renderer.ts`, `src/index.html` — xterm.js view, no Node.
- `scripts/build.js` — esbuild bundles + asset copy.
- `scripts/run-smoke.js` — headless Electron runner (timeout + logs;
  120 s for the lifecycle flag, 45 s otherwise).
- `mock-cli/mock-cli.js` — scripted local CLI, zero dependencies.

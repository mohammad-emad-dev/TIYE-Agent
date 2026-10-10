# TIYE S1 terminal prototype — display/input channel + member lifecycle (S1a + S1b + 9f BASELINE)

S1a proves the Electron display/input channel (Architecture 2.1, 5.2); S1b
adds a bounded member lifecycle exercise for parts of S1 steps 9a–9d plus a
read-only 9e probe; the 9f BASELINE adds a crash-and-relaunch feasibility
observation only (no job, no recovery state machine, no 9f pass). Main
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
mock CLI's `exit` command — never a PID kill), the mock-core process is
asked to exit itself with a `SHUTDOWN` line plus stdin close (no
force-kill fallback: a core that does not exit fails Stop loudly and the
app stays open rather than orphaning it), then the app ends. A separate
mock-core OS process (`mock-core/mock-core.js` on Node) covers 9b: it
subscribes to the main-owned session over a narrow stdio JSON-lines IPC
(`SUBSCRIBE`/`READY` out, `SUBSCRIBED`/`SHUTDOWN` in) and a core stop +
restart as a new OS process re-subscribes to the same live session.
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
npm run smoke:crash-baseline &:: S1 9f BASELINE only: crash-and-relaunch
                        &:: feasibility probe (durable PID+creation
                        &:: registry, runner-owned kill, read-only
                        &:: recovery check; no job, no 9f pass)
npm run smoke:job-probe &:: Isolated Windows Job Object API probe only
                        &:: (PowerShell + C# P/Invoke controller, no
                        &:: Electron/PTY; mock-child fixture; no 9f pass)
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

## Automated evidence (this machine, 2026-10-09 through 2026-10-10)

- `npm run check` — `tsc --noEmit` + esbuild bundles: PASS.
- `npm run smoke` — Electron-hosted real ConPTY, same assertions: PASS.
- `npm run smoke:window` — hidden BrowserWindow, sandboxed renderer,
  preload bridge READY, graceful `exit` driven **through**
  `window.tiyeTerminal.sendInput`, PTY exit 0, non-empty screenshot:
  PASS (see `dist/smoke-shot.png` after a run).
- `npm run smoke:lifecycle` — S1 9a–9d + 9b + bounded **9e** against the
  local mock CLI, driven by internal hooks (no dialog/tray clicks): 9a Keep
  Running keeps the same PTY PID/session identity through close (spawn #
  stays 1); Open sends input from the new window's renderer through the
  preload bridge (`echo: hello reopen` observed at the PTY, still spawn
  #1); 9b stops `mock-core-1` (SHUTDOWN line, exit 0) and restarts it as a
  new OS process `mock-core-2` which re-subscribes over stdio JSON-lines
  IPC to the same session/PID with spawn # still 1 — the smoke asserts the
  core PID changed while member session ID, member PID and spawn count did
  not; 9c Stop and 9d tray-Quit each request graceful shutdown, observe PTY
  exit 0, and end the mock-core process; **9e** captures the member tree
  rooted at the PTY PID before each Stop/Quit as PID + Windows creation-time
  identities (`Get-CimInstance Win32_Process`, read-only, never kills) and
  re-enumerates after the stop — this run captured 1 identity
  (`node.exe` root, no children for the mock CLI) before 9c and 1 before
  9d, and verified all gone (`attempts=1` each): PASS.
  Exit 0 alone is not cited as tree-death proof; only the 9e re-enumeration
  is. 9e fails the smoke if any captured PID + creation-time identity
  survives; a PID reused with a different creation time counts as gone, and
  no unrelated process is ever targeted. On non-Windows 9e logs a clear
  skip without claiming a pass. No Job Object in this task.
- `npm run smoke:crash-baseline` — S1 **9f BASELINE** crash-and-relaunch
  feasibility probe only (2026-10-10, Windows, mock CLI + descendant
  fixture): `--crash-baseline` main starts the mock CLI in a main-owned PTY,
  proves the crash fixture armed (`crash-mode armed`), sends `tree`, confirms
  a live 3-identity tree (root `node.exe` + child `node.exe` + `conhost.exe`,
  each PID + `CreationDate`), atomically writes the durable registry
  (`schema=tiye-crash-baseline-registry v1`, session/member ID, root
  PID+creation, tree, `lastIntent=run`) before `READY`, and stays alive; the
  runner kills ONLY its runner-owned Electron `ChildProcess` via the handle
  (`SIGTERM`, no `taskkill`/PID kill) and relaunches `--crash-recovery-check`,
  which read-only re-enumerates by PID+creation with no duplicate launch and
  no captured-member PID kill. All 3 identities were verified alive just
  before the kill. Observed outcome on this kill path: `GONE count=3`,
  `SURVIVORS count=0 (attempts=1)`, `RESULT survivors=0`, exit 0 at 3,982 ms
  after fixture launch, far before the 55 s/60 s fixture bound. The cause
  of disappearance is not isolated by this baseline. No Job
  Object exists, so no job behavior is inferred; 9f stays **partial**; exit 1
  is reserved for a survivor-present baseline, exit 2 for harness failure.
  No bounded-cleanup wait was needed (nothing survived); no PID kill was used
  at any point. See `RESULTS.md`.
- No vendor CLI and no network model were used in any automated check.
- `npm run smoke:job-probe` — isolated Windows Job Object API feasibility
  observation only (2026-10-10, Windows, `mock-child.js` fixture directly,
  no Electron, no PTY, no mock-cli parent): control case held a no-job
  child alive ~2 s on open stdin then exited it via stdin (code 0); job
  case reached controller `READY` after a same-handle `GetProcessTimes`
  identity check, read-back of `KILL_ON_JOB_CLOSE` flags (`0x2000`),
  `AssignProcessToJobObject`, and `IsProcessInJob=true`. Closing the
  controller-owned job by terminating only the runner-owned controller
  ended the exact child identity on the first re-enumeration, 2,803 ms
  after child spawn and far before its 60 s self-expiry: isolated probe
  **PASS**. The controller uses a one-microsecond bound for the observed
  CIM/FileTime conversion skew. This host uses an outer job, so this was
  a nested assignment; Electron/PTY integration remains untested. No
  captured child PID was targeted for termination. 9f stays **partial**;
  see `RESULTS.md`.
- S1 overall remains **partial** (see below).

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

## NOT implemented / NOT passed beyond S1a–S1b–9e–9f-BASELINE

- S1 step **9e (bounded, Windows + mock CLI only) is implemented** in
  `src/process-tree-9e.ts` + the lifecycle smoke: PID + `Win32_Process`
  `CreationDate` capture before 9c/9d, read-only re-enumeration after, fail
  on survivor, no kills as part of 9e. **What this proves:** after a
  graceful `exit` through the PTY, no captured member identity remained in
  this run (1 root `node.exe` each, no children — the mock CLI spawns no
  child processes). PID reuse is safe because identity is PID + creation
  time, and unrelated PIDs are never targeted. **What remains untested:**
  real vendor CLIs that spawn children (trees >1), grandchildren arriving
  between capture and stop, non-Windows behavior (9e skips without a pass),
  and any claim that exit code 0 alone proves tree death.
- S1 step **9f BASELINE (feasibility probe only, no pass) is implemented**
  as `--crash-baseline` / `--crash-recovery-check` in `src/main.ts` plus
  `scripts/run-crash-baseline.js` (`npm run smoke:crash-baseline`): the
  baseline main starts the mock CLI in a main-owned PTY, proves the crash
  fixture armed, sends `tree`, confirms a live ≥2-identity tree via the 9e
  helper, atomically writes the durable registry
  (`schema=tiye-crash-baseline-registry v1`: session/member ID, root
  PID+creation, tree, `lastIntent=run`) before `READY`, and stays alive; the
  runner kills ONLY its runner-owned Electron `ChildProcess` via the handle
  and relaunches a read-only recovery check (no duplicate, no PID kill).
  **Observed 2026-10-10:** 3-identity mock tree, then `GONE=3` /
  `SURVIVORS=0 (attempts=1)`, exit 0 — all 3 identities were alive immediately
  before the kill and gone at recovery, 3,982 ms after fixture launch, far
  before the 55 s root / 60 s child fixture bound. No cause is inferred:
  no Job Object exists here. Exit 1 is
  reserved for a survivor-present baseline and exit 2 for harness failure.
  **Still NOT implemented:** any Windows Job Object, any product recovery
  state machine, any verified-identity cleanup of real survivors (the runner
  only waits for bounded self-expiry), and any 9f pass. Crash-mode fixture
  changes are env-gated (`TIYE_MOCK_CRASH_MODE=1`): the root ignores stdin
  close and self-expires in 55 s; the child ignores stdin close and
  self-expires in 60 s; ordinary `tree`/`tree-stop`/`exit` paths are
  unchanged. Never `taskkill` / `Stop-Process` / PID-only kill; never a
  captured member PID. A keep-running PTY from 9a remains intentionally
  owned, not an orphan. S1 and 9f stay **partial**.
- Real installed CLIs: lifecycle paths are evidenced with the local
  mock CLI only; vendor-CLI behavior (permission prompts, resume, output
  patterns) is still manual per S1 steps 1–8.
- **Job Object probe (isolated API observation only, no 9f pass) lives in
  `scripts/job-probe-controller.ps1` + `scripts/run-job-probe.js` (`npm
  run smoke:job-probe`): built-in Windows PowerShell + C# P/Invoke, no new
  npm dependencies, no Electron/PTY integration. It proves only that the
  `CreateJobObject` / `SetInformationJobObject(KILL_ON_JOB_CLOSE)` /
  `AssignProcessToJobObject` / `GetProcessTimes` / `IsProcessInJob` call
  sequence runs, the `KILL_ON_JOB_CLOSE` flag reads back as `0x2000`, and
  closing the controller-owned job terminates its assigned fixture. The
  same-handle creation-identity check allows at most one microsecond of
  CIM/FileTime conversion skew. Still NOT implemented around it: Electron main-owned PTY
  assignment, descendant inheritance under a real member tree, crash
  relaunch, durable registry reconciliation, and vendor CLIs. None of the
  9f-BASELINE files or the crash fixture behavior were changed by this.
- **WSL** cases (S6): not implemented or tested.
- No pass/fail claim for the full S1 test is made by this prototype; S1
  stays **partial** and 9f stays **partial** until job boundary,
  survivor-present recovery, vendor-CLI trees, and manual steps 1–8 are
  recorded.

## Layout

- `src/main.ts` — window + single main-owned PTY session, launch
  resolution, IPC validation, tray (Open/Quit), graceful stop-all,
  separate mock-core OS process subscribe/stop/restart (`startMockCore` /
  `stopMockCore` over stdio JSON-lines IPC), bounded 9e capture/verify
  around 9c Stop and 9d Quit, `--smoke-test` / `--window-smoke` /
  `--lifecycle-smoke`, plus 9f BASELINE `--crash-baseline` (main-owned PTY +
  `tree` + ≥2-identity capture + atomic durable registry before `READY`,
  stays alive) and `--crash-recovery-check` (read-only registry +
  re-enumeration, no duplicate, no PID kill; exit 0/1/2).
- `src/process-tree-9e.ts` — bounded Windows-only 9e helper (read-only
  `Get-CimInstance Win32_Process`, PID + `CreationDate` identities,
  `captureProcessTree` / `verifyIdentitiesGone`, no kills, no extra deps).
- `mock-core/mock-core.js` — separate mock-core OS process (no deps, no
  network): sends `SUBSCRIBE`, waits for `SUBSCRIBED`, replies `READY`,
  exits 0 on `SHUTDOWN` or closed stdin; protocol on stdout, logs on
  stderr.
- `src/preload.ts`, `src/shared.ts` — narrow validated bridge + contract.
- `src/renderer.ts`, `src/index.html` — xterm.js view, no Node.
- `scripts/build.js` — esbuild bundles + asset copy.
- `scripts/run-smoke.js` — headless Electron runner (timeout + logs;
  120 s for the lifecycle flag, 45 s otherwise).
- `scripts/run-crash-baseline.js` — 9f BASELINE runner only: test-specific
  registry path, waits for `READY` + registry, kills ONLY its runner-owned
  Electron `ChildProcess` via the handle, relaunches `--crash-recovery-check`,
  records the immediate outcome (exit 1 survivors / 0 none / 2 harness
  failure), then read-only waits for the exact identities to self-expire
  within the bound (no PID kill; bound-exceeded is loud exit 2, no cleanup
  claimed). Never `taskkill` / `Stop-Process` / PID kill.
- `mock-cli/mock-cli.js` — scripted local CLI, zero dependencies (`tree`
  spawns the descendant, `tree-stop` stops it via stdin, `exit` drains it
  first; all other commands unchanged; `TIYE_MOCK_CRASH_MODE=1` arms the 9f
  BASELINE fixture: stdin-close ignored, 55 s self-expire).
- `mock-cli/mock-child.js` — deterministic long-lived descendant fixture
  for the 9f BASELINE only: exits itself on an `exit` stdin
  line, stays alive on stdin close, self-expires after 60 s, no PID kills.
- `scripts/job-probe-controller.ps1` — isolated Job Object controller
  (no Electron/PTY): opens the supplied child PID, verifies creation
  identity with the SAME handle (`GetProcessTimes` vs caller ISO, at most
  one microsecond of conversion skew), creates an unnamed job, sets and
  reads back `KILL_ON_JOB_CLOSE`, assigns,
  confirms `IsProcessInJob`, prints structured `READY`, holds the job
  handle until its own process exits (normal exit closes it; abnormal
  termination closes it via the OS).
- `scripts/run-job-probe.js` — isolated probe runner (`npm run
  smoke:job-probe`): no-job control case (~2 s alive, stdin `exit`,
  observed exit) plus the job case above (READY wait, runner-owned
  controller kill via handle only, PID+creation re-enumeration well
  before the 60 s bound; setup failure is inconclusive exit 2 with the
  child asked to exit, surviving closure is FAIL exit 1 after a normal
  stdin `exit`). Never `taskkill` / `Stop-Process` / PID kill; no fixture
  orphaned. Reuses `mock-child.js` directly (single-process fixture, no
  PTY, no mock-cli parent); the fixture itself is unchanged.

# TIYE S1 terminal prototype — display/input channel + member lifecycle (S1a + S1b + 9f BASELINE + crash-survivor)

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
npm run smoke:crash-job &:: S1 9f crash+job experiment only (Windows
                        &:: mock-tree): Electron main-owned PTY + proven
                        &:: Job controller with opt-in -HoldUntilStdinClose
                        &:: hold (piped stdin, VERIFY over pipe), durable
                        &:: job registry, runner-owned kill, read-only
                        &:: recovery; no 9f pass, S1 stays partial
npm run smoke:identity-stop &:: Isolated verified-identity stop slice only
                        &:: (PowerShell 5.1 + C# P/Invoke helper, no
                        &:: Electron/PTY/job; mock-child fixture; no 9f pass)
npm run smoke:crash-survivor &:: S1 9f crash-survivor experiment only
                        &:: (Windows mock sidecar): Electron main direct
                        &:: child OUTSIDE PTY/job + durable survivor
                        &:: registry, runner-owned kill, relaunched
                        &:: recovery drives verified-identity cleanup;
                        &:: plus wrong-creation fail-closed case; no 9f pass
npm run smoke:crash-pty-survivor &:: End-to-end mock flow: mock CLI inside the
                        &:: main-owned PTY launches a detached child; the
                        &:: runner kills only its Electron handle, proves the
                        &:: exact survivor alive, relaunches ordinary startup
                        &:: (--startup-recovery-alert-smoke) on the SAME real
                        &:: durable registry (positive: visible paused exact;
                        &:: tampered creation: visible paused mismatch
                        &:: creation-mismatch; both with no member, no
                        &:: helper, no mutation, no recovery logs), proves the
                        &:: survivor still alive, then runs the explicit
                        &:: recovery (positive CLEANED + exact-gone, tampered
                        &:: ALERT/PAUSED + untouched until separate teardown);
                        &:: no 9f pass.
npm run smoke:startup-recovery-alert &:: Invalid, absent, exact, and tampered
                        &:: creation/name-mismatch registries on ordinary
                        &:: startup each show a visible per-state paused
                        &:: alert window with no member spawn, no
                        &:: recovery call, and no cleanup helper invocation.
npm run smoke:cli-launch &:: Headless real-CLI launch only: installed
                        &:: `opencode --version` via resolveLaunch /
                        &:: spawnMember + ConPTY, version line + clean
                        &:: PTY exit 0, no stdin or model request; NOT
                        &:: interactive/display S1 success.
npm run smoke:cli-tui-startup &:: Bounded real-CLI TUI startup/render probe:
                        &:: installed `opencode` with EMPTY args via the
                        &:: existing resolveLaunch / ensureMember /
                        &:: hidden BrowserWindow + renderer bridge; waits
                        &:: for renderer READY + real PTY startup bytes,
                        &:: captures dist/cli-tui-startup-shot.png, logs
                        &:: marker booleans + bare semver only (no ANSI
                        &:: spam, no secrets, no full-buffer dump), submits
                        &:: NO stdin or prompt text or model request, then the runner
                        &:: ends ONLY its runner-owned Electron handle and
                        &:: read-only verifies the exact PID+creation tree
                        &:: gone (unproven teardown = inconclusive exit 2,
                        &:: never PASS); hidden window, no human visual
                        &:: comparison; NOT S1 steps 1-8.
npm run smoke:cli-input &:: Bounded real-CLI input probe (opt-in, same runner
                        &:: --input-probe, distinct --cli-input-smoke flag):
                        &:: installed `opencode` with EMPTY args plus a
                        &:: harmless ASCII token typed via sendInputEvent
                        &:: keyDown+char+keyUp per char through the xterm
                        &:: path (no Enter, never submitted, no model
                        &:: request) in a VISIBLE opt-in BrowserWindow
                        &:: (hidden windows cannot reliably take keyboard
                        &:: focus; still the Electron renderer, not a native
                        &:: terminal); captures distinct before/after shots
                        &:: dist/cli-input-before.png +
                        &:: dist/cli-input-after.png and rejects an unchanged
                        &:: render; automated PASS means keyboard event +
                        &:: changed render only, NOT semantic prompt
                        &:: acceptance (orchestrator visually inspects the
                        &:: after-shot); same exact-tree-gone teardown proof,
                        &:: else inconclusive; NOT S1 step 3, parity,
                        &:: Unicode, approvals, or model behavior.
npm run smoke:cli-paste &:: Bounded real-CLI multiline-paste probe (opt-in,
                        &:: same runner --paste-probe, distinct
                        &:: --cli-paste-smoke flag): installed `opencode`
                        &:: with EMPTY args plus the fixed harmless multiline
                        &:: ASCII token TIYEPASTE_A7 LF TIYEPASTE_B8 LF
                        &:: TIYEPASTE_C9 delivered SOLELY via xterm
                        &:: Terminal.paste() through a query-gated renderer
                        &:: hook (no OS clipboard read/overwrite, no Ctrl+V,
                        &:: no sendInputEvent, no term.write from the harness,
                        &:: never Enter/submit, no model request) in a VISIBLE
                        &:: opt-in BrowserWindow; requires the real TUI to have
                        &:: enabled term.modes.bracketedPasteMode before sending
                        &:: (fail closed, no paste otherwise); captures
                        &:: dist/cli-paste-before.png +
                        &:: dist/cli-paste-after.png and requires exactly one
                        &:: ESC[200~ + payload + ESC[201~ INPUT in main with no
                        &:: stray plus OpenCode's three-line paste indicator
                        &:: and changed screenshots; automated PASS means
                        &:: bracketed evidence + indicator + changed render,
                        &:: NOT semantic editor arrival and NOT no-network proof
                        &:: (orchestrator visually inspects both shots; do NOT
                        &:: assume Terminal.paste() equals the OS shortcut);
                        &:: Job Object containment before PTY spawn and
                        &:: exact-tree-gone teardown proof, else inconclusive;
                        &:: NOT S1 step 3/6, parity, Unicode,
                        &:: approvals, or model behavior.
npm run smoke:cli-resize &:: Bounded real-CLI resize probe (dedicated
                        &:: scripts/run-cli-resize.js, distinct
                        &:: --cli-resize-smoke flag): installed `opencode`
                        &:: with EMPTY args in the existing main-owned PTY +
                        &:: VISIBLE renderer, NO keyboard input, NO PTY
                        &:: write, NO submit, NO model request; captures
                        &:: dist/cli-resize-before.png, resizes the
                        &:: BrowserWindow content ONCE to 800x500, waits
                        &:: for a CHANGED valid xterm->IPC->node-pty
                        &:: cols/rows observation (requested size alone
                        &:: is never proof), captures
                        &:: dist/cli-resize-after.png at distinct pixel
                        &:: dims; automated PASS means observed dims change
                        &:: + distinct screenshots + teardown only, NOT
                        &:: visual reflow or S1 step 5 (orchestrator
                        &:: visually inspects both shots); same
                        &:: exact-tree-gone teardown proof, else
                        &:: inconclusive.
```

Setting `TIYE_CRASH_PTY_SURVIVOR_REGISTRY_PATH` on ordinary startup opts into
the mock recovery gate. It reads and parses that registry read-only before
spawning any member, then does one bounded read-only current-process lookup
for the parsed `childPid` (10 s CIM timeout, `lookupSingleProcess`), then
always shows a visible paused-alert window and keeps the prototype paused.
The window and logs distinguish five informational-only statuses: `invalid`
(registry unreadable/malformed, no lookup), `absent` (saved identity absent),
`exact` (live PID+creation+case-insensitive name match), `mismatch`
(live PID present but saved creation and/or name differ, with
`creation-mismatch` vs `name-mismatch` logged), and `lookup-failed`
(bounded lookup failed; the window is still shown). Every state stays
paused: nothing auto-resumes, nothing is inferred as safe relaunch (the
`exact` text says so explicitly), and ordinary startup never calls
`runCrashPtySurvivorRecovery()`, never invokes
`verified-identity-stop.ps1`, never kills, never spawns a PTY/member, and
never mutates the registry. Each status has static window text; no registry
data is interpolated into the HTML. No cleanup is attempted or verified in
any state. The registry is unauthenticated against same-user tampering, so
every observation is informational only. This test-only gate does not resume
a member or provide product crash recovery; explicit
`--crash-pty-survivor-recovery-check` stays the only cleanup path.
`scripts/run-crash-pty-survivor.js` exercises this gate end to end on the
SAME real durable registry between the post-crash exact-survivor proof and
the explicit recovery: the positive run requires a visible paused `exact`
gate with the survivor independently proven still alive afterward, and the
tampered-creation run requires a visible paused `mismatch`
(`reason=creation-mismatch`) gate with the ORIGINAL survivor proven still
alive afterward, before the existing explicit-recovery outcomes and
test-only teardown. All gate + recovery observations stay well inside the
60 s fixture bound (35 s per-scenario, 55 s suite); slow/racy cases are
inconclusive exit 2, safety violations fail exit 1. S1 and 9f stay partial.

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

Windows launch resolution (bounded fix): for a bare name, `resolveOnPath`
takes all `where.exe` lines in order and returns the first `.com`, `.exe`,
`.bat`, or `.cmd` result (case-insensitive). It skips extensionless POSIX
shell shims and file-association types such as `.js`. For example, npm's
extensionless `opencode` shell file is skipped in favor of `opencode.cmd`;
ConPTY cannot spawn the former (error 193). Explicit absolute/relative paths
(containing `/`, `\`, or a drive root) keep current behavior and are not
filtered. No vendor path
is hardcoded and no new dependency was added.

Manual vendor example (interactive, never in automated checks):

```bat
set TIYE_S1_COMMAND=opencode
set TIYE_S1_ARGS_JSON=[]
npm start
```

This resolves bare `opencode` to `opencode.cmd` via the rule above. Headless
`npm run smoke:cli-launch` is the headless automated vendor-CLI check: it runs
the installed `opencode --version` via `resolveLaunch` / `spawnMember` in
headless Electron/ConPTY (`--cli-launch-smoke`), asserts a version line and
clean PTY exit 0 with no stdin or model request, and reports the resolved path. It proves launch +
version + exit only — NOT interactive/display S1 success.
`npm run smoke:cli-tui-startup` is the bounded TUI startup/render check: installed
`opencode` with EMPTY args via the existing main-owned PTY + hidden renderer
(`--cli-tui-startup-smoke`), renderer READY + real PTY startup bytes +
`dist/cli-tui-startup-shot.png` + marker booleans/bare semver only, no stdin
or model request, then runner-owned Electron kill + read-only exact-tree-gone
verification (unproven teardown = inconclusive, never PASS; hidden window, no
human visual comparison). It proves startup output reaches xterm only — NOT
S1 steps 1–8, editing keys, approvals, unicode, resize, or lifecycle.
`npm run smoke:cli-input` is the bounded input check (opt-in `--input-probe`
mode of the same runner, distinct `--cli-input-smoke` flag): same fixed
`opencode` + empty args plus a harmless ASCII token (`tiyeinprobe7q3z9`,
alphanumerics only, no Enter, never submitted, no model request) typed via
`sendInputEvent` keyDown+char+keyUp per char through the xterm path in a
VISIBLE opt-in BrowserWindow (hidden windows cannot reliably take keyboard
focus; still the Electron renderer, not a native terminal), distinct
`dist/cli-input-before.png` + `dist/cli-input-after.png` with a runner hash
rejection of an unchanged render, and the same runner-owned kill +
read-only exact-tree-gone proof (unproven = inconclusive). Automated PASS
means keyboard event + changed render only — NOT semantic prompt acceptance
(orchestrator visually inspects the after-shot). This does not complete S1
step 3 or test visual parity, Unicode, approvals, or model behavior. Real vendor S1
steps 1–8 with `opencode` (or any vendor CLI) remain manual/unverified, and
S1 stays partial until those manual observations are recorded.
Both probes now share the main-process `runRealCliTuiProbe(mode)` driver and
`captureStoreProbeShot` helper for launch, PTY startup, renderer readiness, and
screenshot capture, with paste-specific steps isolated in the small named
`runCliPasteInteraction` helper and resize-specific steps isolated in the small
named `runCliResizeInteraction` helper (no long inline paste/resize branch).
Startup remains hidden; input/edit/history/paste/resize remain visible (paste
sends ONLY Terminal.paste(), resize sends no input at all). The runner still
requires verified Job Object containment before PTY spawn, then ends its own
Electron process, releases the job, and verifies that the captured process
tree is gone before reporting PASS.

`npm run smoke:cli-edit` starts a separate visible real-OpenCode probe. It types
`tiyeeditab12`, sends Home, Right, Delete, End, and Backspace, then types `z`
without Enter; the expected final text is `tyeeditab1z`. It saves
`dist/cli-edit-before.png` (empty prompt) and `dist/cli-edit-after.png`, then
uses the same exact-tree teardown check. Automated PASS verifies sent events,
changed screenshots, and teardown; visual inspection is needed to check the
text. Command history and S1 step 3 remain unverified.
Visible-window focus can be inconsistent on this host; an unchanged screenshot
fails the probe rather than counting as an editing pass.

`npm run smoke:cli-history` submits only OpenCode's built-in `/help` command,
then sends Escape and Up without another submission. It captures
`dist/cli-history-up.png` after the uninterrupted key sequence and uses the
same exact-tree teardown check. Automated PASS verifies the help marker, sent
events, screenshot, and teardown; it does not establish recalled history.
On this host, visual inspection showed an empty composer after Up, so S1
step 3 remains partial.

`npm run smoke:cli-paste` runs installed OpenCode v2.0.22 with empty args in
the visible Electron/ConPTY window and delivers ONLY the fixed harmless
multiline ASCII token (`TIYEPASTE_A7` LF `TIYEPASTE_B8` LF `TIYEPASTE_C9`,
38 chars, 3 lines) SOLELY via xterm `Terminal.paste()` through a
query-gated renderer hook (`?tiye-paste-probe=1`; production UI has no hook,
fixed payload validated in the hook). The OS clipboard is never read or
overwritten (terminal paste path, NOT Ctrl+V/system clipboard; do NOT assume
equivalence). Before sending, the real TUI must have enabled
`term.modes.bracketedPasteMode` in the renderer, else fail closed with NO
paste. NEVER presses Enter, NEVER types a model prompt, NEVER calls a model,
NEVER writes directly to node-pty from the harness (`sendInputEvent` and
harness `term.write` absent; the only PTY write is the normal
renderer→IPC→PTY INPUT handler). Main captures the exact INPUT (exactly one
`ESC[200~` + normalized payload + `ESC[201~` sequence, xterm normalizes
`\r?\n` to `\r` before bracketing, no stray input; lengths + booleans only,
never arbitrary TUI/user data) plus `dist/cli-paste-before.png` +
`dist/cli-paste-after.png` (nonempty, changed pixels required). Automated PASS
means bracketed evidence + changed render + teardown only — NOT semantic
editor arrival and NOT no-network proof (orchestrator visually inspects both
shots). The runner assigns Electron to a Windows kill-on-close Job Object
before allowing the PTY to spawn, then releases the job and verifies the
captured process identities are gone. A detached OpenCode service grandchild
survived an earlier Electron-only teardown; see RESULTS.md. An automated
PASS also requires OpenCode's three-line paste indicator. It does not prove
the exact editor contents or the OS clipboard shortcut.

`npm run smoke:cli-resize` runs installed OpenCode v2.0.22 with empty args in
the visible Electron/ConPTY window and sends NO input at all (no
`sendInputEvent`, no PTY write, no Enter, no model request). It captures
`dist/cli-resize-before.png`, resizes the BrowserWindow content ONCE to
800x500, waits for a CHANGED valid xterm→IPC→node-pty cols/rows
observation (a logged requested size alone fails the probe), then captures
`dist/cli-resize-after.png`. Automated PASS requires valid changed cols/rows,
nonempty different screenshots at distinct PNG pixel dimensions (read
independently from the IHDR, not just logged sizes), and the same
exact-tree-gone teardown; it does NOT prove visual reflow, S1 step 5, or S1
pass (orchestrator visually inspects both shots).

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
- `npm run smoke:launch-shim` — bounded Windows launch-resolution
  regression (real ConPTY, mock CLI only, no vendor model): temp dir with
  spaces holds both an extensionless POSIX shim and a same-name `.cmd` that
  launches the local mock CLI through Node; temp dir first on PATH, bare
  `TIYE_S1_COMMAND`, `TIYE_S1_ARGS_JSON=[]`; `where.exe` proves the
  extensionless file lists before the `.cmd`, Electron resolves/spawns the
  `.cmd`, and the existing banner/echo/resize/fast/exit assertions pass:
  PASS. Fixture cleaned; explicit paths unchanged; launchable results keep
  their `where.exe` order.
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
- `npm run smoke:identity-stop` — isolated verified-identity stop slice only (2026-10-10, Windows, `mock-child.js` fixture directly, no Electron, no PTY, no mock-cli parent, no Job Object, no durable registry): the target stays alive after a deliberately wrong saved creation time is refused (`REFUSED`, exit 1, no termination), then the exact PID+creation identity is terminated via the SAME opened handle (`STOPPED`, exit 0) and found gone on the first read-only re-enumeration, about 2.7 s after spawn and far before its 60 s self-expiry, while an unrelated live control child is untouched until its normal stdin `exit` (code 0): isolated slice **PASS**. The helper requests only terminate, limited query, and synchronize rights and checks `GetProcessTimes` on that handle with at most 10 ticks of CIM/FileTime skew (latest run: 6 ticks on match), refuses on mismatch, terminates only on match on the same handle, waits boundedly (5 s) on that handle, and closes the handle on all paths. Exit contract: 0 STOPPED, 1 REFUSED, 2 FAIL. Never PID-only kill. 9f stays **partial**; see `RESULTS.md`.
- `npm run smoke:crash-survivor` — S1 9f crash-survivor feasibility experiment only (2026-10-10, Windows, `mock-child.js` as a controlled Electron-main direct sidecar OUTSIDE PTY/job, `detached:true` so it survives main death on this host; a non-detached direct child was observed gone after the same kill and would be inconclusive, not pass): positive path proves post-kill survivor alive BEFORE recovery, then relaunched recovery invokes `verified-identity-stop.ps1` with the SAVED identity (`STOPPED` exit 0, 9 ticks) and re-enumerates exact-gone on the first attempt (~5.5 s after spawn, suite ~10.9 s, far before 60 s); tampered path (+1 h saved creation) proves `ALERT`/`PAUSED` with NO helper invocation and the original survivor untouched until a SEPARATE test-only teardown with the original identity (also `STOPPED`, exact-gone): experiment **PASS** (bounded feasibility, no 9f pass). Registry schema checks do NOT establish file authenticity against same-user tampering — the tampered case proves fail-closed refusal, not production trust; no HMAC secret is stored beside the registry. Never PID-only kill. 9f stays **partial**; see `RESULTS.md`.
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
- **Verified-identity stop slice (isolated safety primitive only, no 9f pass) lives in `scripts/verified-identity-stop.ps1` + `scripts/run-identity-stop.js` (`npm run smoke:identity-stop`): built-in Windows PowerShell 5.1 + C# P/Invoke, no new npm dependencies, no Electron/PTY/job integration in this gate. It proves only that a controlled surviving mock process is terminated ONLY after its saved PID+creation identity is checked on the SAME opened handle (10-tick bound), and that a wrong creation identity is refused while the process stays alive. The separate crash-survivor experiment below exercises this helper from relaunched recovery; durable-registry authenticity, vendor CLIs, and real PTY trees remain unproven. None of the 9f-BASELINE/job files or the fixture behavior were changed by this.
- **Crash-survivor experiment (bounded feasibility only, no 9f pass) lives in `src/crash-survivor.ts` + `--crash-survivor` / `--crash-survivor-recovery-check` in `src/main.ts` + `scripts/run-crash-survivor.js` (`npm run smoke:crash-survivor`): Electron main spawns `mock-child.js` as a direct detached sidecar OUTSIDE PTY/job (controlled sidecar, not a CLI member tree; stdin held open, ignores EOF, 60 s self-expire unchanged), requires `parentPid==mainPid` + `name==node.exe`, writes a distinct atomic registry (`schema=tiye-crash-survivor-registry v1`, session/member ID, `lastIntent=run`, main+child identities, `createdAt`) before `READY`, and stays alive; the runner kills ONLY its runner-owned Electron handle, proves the exact sidecar alive AFTER main death BEFORE recovery (else inconclusive exit 2), then relaunches recovery which strictly validates the registry (no PTY/duplicate), fails closed with `ALERT`/`PAUSED` on absent/mismatched/inconsistent identities without invoking the helper, otherwise invokes `verified-identity-stop.ps1` with the SAVED identity and requires `STOPPED` exit 0 plus exact-gone re-enumeration (no fallback PID kill). The tampered-creation scenario (+1 h, original retained separately) must `ALERT`/`PAUSE` with no helper and leave the original alive until a SEPARATE test-only teardown with the original identity. **Registry authenticity limit (explicit):** schema/version/`lastIntent` checks prove only that the file parses as this experiment's registry; they do NOT establish authenticity against same-user tampering (any same-user process can rewrite the file), so this is a controlled feasibility experiment, not a production cleanup guarantee — no HMAC secret is invented beside the registry. Observed host note: a non-detached direct child was gone after the same runner-owned kill (inconclusive path, not pass); `detached:true` (+`unref`) is what lets the controlled sidecar survive for cleanup on this host. Exit contract: recovery 0 CLEANED / 1 ALERT-PAUSED / 2 harness; runner 0 PASS / 1 safety-FAIL / 2 inconclusive. S1/9f stay **partial**.
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
  re-enumeration, no duplicate, no PID kill; exit 0/1/2), plus the bounded
  9f job experiment `--crash-job` (PTY + `-HoldUntilStdinClose` controller +
  `VERIFY` root/child + job registry before `READY`, stays alive) and
  `--crash-job-recovery-check` (read-only job registry + re-enumeration;
  exit 0/1/2), plus the bounded 9f crash-survivor experiment
  `--crash-survivor` / `--crash-survivor-recovery-check` (delegated to
  `src/crash-survivor.ts`; no PTY/job in survivor modes).
- `src/process-tree-9e.ts` — bounded Windows-only 9e helper (read-only
  `Get-CimInstance Win32_Process`, PID + `CreationDate` identities,
  `captureProcessTree` / `verifyIdentitiesGone`, no kills, no extra deps).
- `src/crash-survivor.ts` — bounded 9f crash-survivor logic (separate
  module, not further bloating `src/main.ts`): direct detached sidecar
  spawn OUTSIDE PTY/job + CIM main/child capture + distinct atomic registry
  (`tiye-crash-survivor-registry v1`) + strict recovery validation +
  verified-identity helper invocation + exact-gone re-enumeration; see the
  module header for the registry-authenticity limit (no HMAC).
- `mock-core/mock-core.js` — separate mock-core OS process (no deps, no
  network): sends `SUBSCRIBE`, waits for `SUBSCRIBED`, replies `READY`,
  exits 0 on `SHUTDOWN` or closed stdin; protocol on stdout, logs on
  stderr.
- `src/preload.ts`, `src/shared.ts` — narrow validated bridge + contract.
- `src/renderer.ts`, `src/index.html` — xterm.js view, no Node. Renderer
  reports xterm fit size on window `resize` plus a `ResizeObserver` on
  `#terminal` (bounded reliability fix for automated BrowserWindow content
  resizes: window-resize alone proved flaky with no follow-up RESIZE IPC in
  3 of 4 pre-fix runs; both paths share the existing fit + `api.resize`
  IPC, no new channel, no synthetic dims).
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
- `scripts/run-crash-job.js` — 9f crash+job runner only (`npm run
  smoke:crash-job`): same safety bounds and handle-only kill, but for
  `--crash-job` / `--crash-job-recovery-check` with the job registry
  (`tiye-crash-job-registry v1`, `jobMode` + controller identity +
  `jobVerified`); fails closed (exit 2) on missing/malformed registry,
  READY mismatch, controller exited early, or observation outside the
  fixture bound; exit 1 when any captured member identity survives, exit 0
  only for the bounded zero-survivor observation with verified membership
  (9f stays partial). Never `taskkill` / `Stop-Process` / PID kill.
- `scripts/verified-identity-stop.ps1` — isolated verified-identity stop helper: opens the supplied PID with minimum rights, checks creation identity on the SAME handle (10-tick bound), refuses without termination on mismatch (exit 1), terminates on the same handle and waits boundedly on match (exit 0), closes on all paths (exit 2 otherwise). Never PID-only kill.
- `scripts/run-identity-stop.js` — isolated slice runner (`npm run smoke:identity-stop`): wrong-identity refusal plus alive proof, then correct-identity stop plus gone proof within the fixture bound, plus an untouched control stopped via stdin. Exit 0/1/2. Reuses `mock-child.js` directly; the fixture itself is unchanged.
- `mock-cli/mock-cli.js` — scripted local CLI, zero dependencies (`tree`
  spawns the descendant, `tree-stop` stops it via stdin, `exit` drains it
  first; all other commands unchanged; `TIYE_MOCK_CRASH_MODE=1` arms the 9f
  BASELINE fixture: stdin-close ignored, 55 s self-expire).
- `mock-cli/mock-child.js` — deterministic long-lived descendant fixture
  for the 9f BASELINE only: exits itself on an `exit` stdin
  line, stays alive on stdin close, self-expires after 60 s, no PID kills.
- `scripts/job-probe-controller.ps1` — isolated Job Object controller
  plus the opt-in `-HoldUntilStdinClose` hold for the crash+job experiment:
  opens the supplied child PID, verifies creation
  identity with the SAME handle (`GetProcessTimes` vs caller ISO, at most
  one microsecond of conversion skew), creates an unnamed job, sets and
  reads back `KILL_ON_JOB_CLOSE`, assigns,
  confirms `IsProcessInJob`, prints structured `READY`, holds the job
  handle until its own process exits (normal exit closes it; abnormal
  termination closes it via the OS). Without the switch the hold is the
  original infinite sleep (standalone `smoke:job-probe` unchanged). With
  `-HoldUntilStdinClose` (piped stdin from Electron main only) it reads
  stdin until EOF — EOF means main died, so it exits and the OS closes the
  last job handle — and answers the narrow `VERIFY <pid> <creationISO>`
  command (`VERIFIED pid=… inJob=True/False` or `VERIFY-FAIL`, same-handle
  check + `IsProcessInJob` vs the held job, verify handle closed). The
  no-job baseline never launches this controller.
- `scripts/run-job-probe.js` — isolated probe runner (`npm run
  smoke:job-probe`): no-job control case (~2 s alive, stdin `exit`,
  observed exit) plus the job case above (READY wait, runner-owned
  controller kill via handle only, PID+creation re-enumeration well
  before the 60 s bound; setup failure is inconclusive exit 2 with the
  child asked to exit, surviving closure is FAIL exit 1 after a normal
  stdin `exit`). Never `taskkill` / `Stop-Process` / PID kill; no fixture
  orphaned. Reuses `mock-child.js` directly (single-process fixture, no
  PTY, no mock-cli parent); the fixture itself is unchanged.
- `scripts/run-crash-survivor.js` — crash-survivor runner only (`npm run
  smoke:crash-survivor`): two fresh-sidecar scenarios (positive CLEANED +
  tampered-creation ALERT/PAUSED) with handle-only Electron kills,
  post-kill survivor proof BEFORE recovery, strict CLEANED/PAUSED/no-helper
  assertions, and a SEPARATE test-only teardown with the original identity
  for the tampered case; exit 0 PASS / 1 safety-FAIL / 2 inconclusive.
  Bounds the suite well inside 60 s; near-expiry is inconclusive, never
  pass. Never `taskkill` / `Stop-Process` / PID kill.
- `src/main.ts` (`--crash-job` / `--crash-job-recovery-check`, `npm run
  smoke:crash-job` via `scripts/run-crash-job.js`) — bounded S1 9f
  crash+job experiment only (Windows mock-tree, no 9f pass): main-owned PTY
  mock CLI, pre-job root PID+creation capture, controller launch with
  `-HoldUntilStdinClose` + piped stdin, controller `READY` (queried
  `0x2000` + same-handle check + assignment + `IsProcessInJob=true`)
  BEFORE `tree`, post-`tree` capture, `VERIFY` of root + at least the mock
  child (`node.exe` non-root) as `inJob=true` before Electron `READY`,
  atomic durable registry (`schema=tiye-crash-job-registry v1` with
  `jobMode=job`, controller PID+creation, `jobFlags=0x2000`,
  `jobVerified`, `jobConhostNote`) before `READY`, then alive until the
  runner kills ONLY its runner-owned Electron handle; main death closes
  the controller stdin pipe (EOF) so the controller exits and closes the
  last job handle. `conhost.exe` is best-effort: if it cannot be verified
  or sits outside the job, the run records `jobConhostNote` and still
  proceeds (ConPTY hosts have been observed outside the assigned job).
  Recovery is read-only (no duplicate, no PID kill): exit 0 = no survivors
  with verified membership recorded, 1 = survivors (FAIL for this
  experiment), 2 = harness failure (missing/malformed registry, READY
  mismatch, controller exited early, lookup failure, or observation
  outside the 55 s/60 s safety bound — never a pass). S1/9f stay partial.
- Real-CLI TUI runners (installed `opencode`, empty args, no model request,
  runner-owned Electron kill + read-only exact-tree-gone proof, exit
  0 PASS / 1 FAIL / 2 inconclusive, never PID kill):
  `scripts/run-cli-launch.js` (`smoke:cli-launch`, headless `--version`),
  `scripts/run-cli-tui-startup.js` (`smoke:cli-tui-startup/input/edit/history`
  via `--cli-*-smoke` flags sharing `runRealCliTuiProbe`), and
  `scripts/run-cli-resize.js` (`smoke:cli-resize`, distinct
  `--cli-resize-smoke` flag, dedicated runner inheriting the same teardown:
  before/after PNGs at distinct IHDR dims + changed valid
  xterm→IPC→node-pty cols/rows + no-input check; NOT visual reflow or S1
  step 5).

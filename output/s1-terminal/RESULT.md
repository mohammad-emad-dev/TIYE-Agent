# S1 — real-CLI terminal cohort (C1 result forms)

**Date:** 2026-11-10 (cohort captured 2026-11-09 local)
**Test:** S1 display/input/teardown probes across installed Claude Code, Codex,
OpenCode and the absent Gemini CLI
**Result:** **Codex Pass (bounded slices); Claude Code Pass (bounded slices);
OpenCode Partial/Fail; Gemini not tested (not installed)**
**Scope:** no Enter, no submit, no model request, no clipboard read; installed
executable launch and visible/hidden renderer observation only. Harness changes
were limited to feasibility probes and are recorded below.

## Probe results

| Probe | Codex 0.164.0 | Claude Code 2.1.321 | OpenCode 2.2.5 | Gemini CLI |
|---|---|---|---|---|
| Installed CLI launch (`--version`, headless ConPTY) | **Pass** — `codex-cli 0.164.0`, exit 0 | **Pass** — `2.1.321 (Claude Code)`, exit 0 | **Pass** — `opencode … v2.2.5`, exit 0 | Not run — command absent |
| TUI startup (hidden window) | **Pass** — `OpenAI Codex` marker; 12 480-byte shot | **Pass** — `Claude Code` marker; 22 774-byte shot | **Pass (with version caveat)** — marker + first semver `2.2.6`; updater/loading shot | Not run |
| Keyboard input + changed render | **Pass** — 8-process tree, exact teardown | **Pass** — tree 1, exact teardown | **Pass** — tree 3, exact teardown | Not run |
| Editing keys + replacement | **Pass** — 8-process tree, exact teardown | **Pass** — tree 1, exact teardown | **Inconclusive** — 3 of 6 captured identities gone before main kill; the after-shot shows the expected `tyeeditab1z` | Not run |
| Multiline paste via `Terminal.paste()` | **Pass** — echo observed; 8-process tree; exact teardown | **Pass** — echo observed; tree 1; exact teardown | **Fail** — exact bracketed input delivered (`count=1`, `match=true`, 50 bytes) but no OpenCode paste indicator and no echo; after-shot composer empty | Not run |
| Single-line Unicode (Arabic + Chinese + Japanese + Korean) | **Pass** — all four scripts in buffer/DOM; 8-process tree | **Pass** — all four scripts; tree 1 | **Fail** — exact bracketed input delivered (76 bytes) but `UNICODE-DISPLAY all=false`; after-shot composer empty, 5-plugin failure overlay | Not run |
| Resize (one BrowserWindow resize) | **Pass** — 118×40 → 87×29, screenshots distinct; tree 1 | **Pass** — 118×40 → 87×29; tree 1 | **Inconclusive** — dims changed 118×40 → 87×29 and shots distinct, but 2 of 5 captured identities gone before main kill | Not run |
| Identity-based teardown | **Pass for every completed probe** — all captured PID+creation identities gone, read-only verification | **Pass for every probe** | **Pass for launch/startup/input and for the paste/Unicode failure teardown** (all captured identities gone); **inconclusive** for edit/resize because helpers exited before the main kill | Not run |

`VERSION` lines in TUI probes are best-effort first-semver matches, not
installed-version proof. Only `run-cli-launch.js` proves the installed version.
The OpenCode startup and later probes reported `2.2.6`, `2.6.2` and `2.6.6`
from TUI text while `opencode --version` and the screenshots' bottom-right
corner show `2.2.5`; the updater banner says `/update to install v2.2.6`.
Treat OpenCode as **2.2.5 installed, with updater churn in the TUI**, not as a
matrix of three tested versions.

## C1 — Codex CLI

| Field | Entry |
|---|---|
| Test and CLI | S1 terminal/lifecycle, Codex CLI 0.164.0 on Windows 11 |
| Tool versions | Windows 11 Pro 10.0.26300; Electron 38.8.6; node-pty 1.1.0; Codex 0.164.0 at `C:\Users\Mohammad\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe` |
| Result | **Pass (bounded slices)** |
| What worked | Headless `--version` launch and clean exit; TUI startup marker; keyboard input and editing through the xterm renderer; multiline paste and fixed Unicode via `Terminal.paste()`; resize propagation to the PTY; exact PID+creation teardown for all six TUI probes |
| What did not | No approval prompt, Ctrl+C, lifecycle close/reopen, crash recovery or Windows Terminal parity was exercised. Input/edit only prove “event delivered + render changed”, not semantic acceptance. Startup was a hidden window with no human visual comparison. |
| Workaround used | Two bounded `Escape` keyDown/keyUp pairs dismiss Codex's first-run notice before input/edit/paste/unicode probes. No text is typed, no Enter is sent. The paste/unicode token itself is never keyboard-typed. |
| Measurements | Launch exit 0. Startup shot 12 480 bytes. Input/edit/paste/unicode each captured an 8-process tree, all gone on the first read-only re-enumeration. Unicode `UNICODE-DISPLAY ar=true zh=true ja=true ko=true all=true`, buffer 1 362, DOM 1 336; exactly one bracketed input, 76 UTF-8 bytes. Paste one bracketed input, 50 bytes. Resize 118×40 → 87×29, shots 1084×685 → 800×500. |
| Evidence | `output/s1-terminal/codex/run-launch.log`, `run-startup.log`, `run-input.log`, `run-edit.log`, `run-paste.log`, `run-unicode.log`, `run-resize.log`, and the matching before/after PNGs |
| Architecture impact | Codex is qualified as an S1 member for the tested display/input/paste/Unicode/resize slices on Windows. Approval, cancellation, lifecycle and crash rows remain open; this is not S1 step 8 or full parity. |

## C1 — Claude Code

| Field | Entry |
|---|---|
| Test and CLI | S1 terminal/lifecycle, Claude Code 2.1.321 on Windows 11 |
| Tool versions | Windows 11 Pro 10.0.26300; Electron 38.8.6; node-pty 1.1.0; Claude Code 2.1.321 at `C:\Users\Mohammad\.local\bin\claude.exe` |
| Result | **Pass (bounded S1 display slices)** |
| What worked | Headless `--version` launch; TUI startup marker; input, editing, paste, Unicode and resize through the same renderer/PTY path; exact teardown for every probe |
| What did not | Startup marker has no semver (launch supplies the version). No S2, S3, S4 or lifecycle/approval work was run; the S4 route for Claude is not qualified in this cohort. |
| Workaround used | None |
| Measurements | Launch exit 0. Startup shot 22 774 bytes. Each TUI probe captured one `claude.exe` identity and verified it gone. Unicode `ar/zh/ja/ko all=true`. Paste one bracketed input, 50 bytes. Resize 118×40 → 87×29. |
| Evidence | `output/s1-terminal/claude/run-launch.log`, `run-startup.log`, `run-input.log`, `run-edit.log`, `run-paste.log`, `run-unicode.log`, `run-resize.log`, and the matching PNGs |
| Architecture impact | The S1 display channel works for Claude Code in these slices, so it is a viable display-only candidate. It is **not** a supported member: S2 tool attachment, S3 worktrees, S4 login classification and lifecycle remain unqualified. |

## C1 — OpenCode

| Field | Entry |
|---|---|
| Test and CLI | S1 terminal/lifecycle, OpenCode 2.2.5 on Windows 11 |
| Tool versions | Windows 11 Pro 10.0.26300; Electron 38.8.6; node-pty 1.1.0; OpenCode 2.2.5 via `C:\Users\Mohammad\AppData\Roaming\npm\opencode.cmd` |
| Result | **Partial / Fail** |
| What worked | `--version` launch (2.2.5, exit 0); TUI startup marker (updater/loading screen); keyboard input and changed render; exact teardown for launch/startup/input and for the paste/Unicode failure runs. The edit probe's after-shot actually shows the expected `tyeeditab1z` in the composer, and resize propagated 118×40 → 87×29. |
| What did not | Multiline paste and Unicode paste were delivered byte-exactly to the PTY but did not appear in the TUI (composer remained empty). Edit and resize were inconclusive because helper identities exited before the main kill, so the harness could not verify the full captured tree. The TUI showed a self-updater banner and **5 failed plugins**: `opencode-vibeguard`, `opencode-websearch-cited`, `opencode-pty`, `opencode-helicone-session`, `@franlol/opencode-md-table-formatter`. |
| Workaround used | None. Paste and edit were each retried once; the failures/inconclusive results reproduced. No updater, plugin or configuration was changed. |
| Measurements | Launch exit 0. Startup shot 7 682 bytes. Input tree 3 gone. Paste: `PASTE-INPUT count=1 focusReports=18 match=true stray=false`, 50 bytes; `PASTE-ECHO=false`, `PASTE-PLACEHOLDER=false`; Electron exited 1 on the intentional probe failure. Unicode: one bracketed input, 76 bytes, `UNICODE-DISPLAY ar=false zh=false ja=false ko=false all=false`; Electron exited 1. Edit: tree 6, 3 gone before main kill; after-shot shows `tyeeditab1z`. Resize: 118×40 → 87×29, shots 1084×685 → 800×500; tree 5, 2 gone before main kill. |
| Evidence | `output/s1-terminal/opencode/run-launch.log`, `run-startup.log`, `run-input.log`, `run-edit.log`, `run-paste.log`, `run-unicode.log`, `run-resize.log`, and the matching PNGs |
| Architecture impact | Do not treat OpenCode 2.2.5 as S1-qualified. Paste/Unicode acceptance and teardown must be re-run after the updater and failed-plugin state is controlled. The failed plugins include a PTY plugin, which is relevant to any OpenCode member launch policy. |

## C1 — Gemini CLI

| Field | Entry |
|---|---|
| Test and CLI | S1 terminal/lifecycle, Gemini CLI |
| Tool versions | Not installed on this host; the earlier S4 inventory recorded `gemini --version` exit 1 |
| Result | **Not tested** |
| What worked | — |
| What did not | No installed executable; the cohort rules prohibit installing a provider CLI |
| Workaround used | None; installation was not attempted |
| Measurements | — |
| Evidence | `feasibility/s4-provider-access/evidence/cli-inventory.json` (2026-10-14, command unavailable) |
| Architecture impact | Gemini remains unqualified for S1–S6. Do not infer parity from an alias or another vendor's model route. |

## Shared limitations

1. **No model behavior.** Every S1 probe stops before Enter/submit and sends no
   prompt. Startup/input/render results say nothing about model, approval or
   tool behavior.
2. **Changed render is not semantic proof.** Input and edit gates prove that a
   keyboard event produced a render change; they do not prove the CLI accepted
   a prompt. The orchestrator inspected the final screenshots.
3. **Resize is dimension proof, not reflow proof.** The harness observed xterm →
   IPC → node-pty dimensions and distinct screenshots, not a visual layout
   comparison.
4. **Hidden startup.** The startup probe uses a hidden window; no human visual
   comparison was performed.
5. **Exact teardown, not crash recovery.** The runner kills only its owned
   Electron child handle, then re-enumerates the exact PID+creation identities
   read-only. It does not terminate by PID and does not test app quit, tray,
   main crash or Windows Terminal closing.
6. **Single-attempt evidence.** Codex input and resize were rerun once each;
   OpenCode paste and edit were rerun once each. Only the final logs are
   retained, so the flake rate is not measured.
7. **Windows only.** No Linux, macOS or Windows Terminal cohort is included.
8. **OpenCode is version-unstable.** The auto-updater and failed plugins make the
   observed behavior specific to this host state; do not generalize to a clean
   2.2.5 installation.

## Harness changes used

- `feasibility/s1-terminal/src/main.ts`: `TIYE_CLI_FAMILY` family switch
  (`opencode` default, `codex`, `claude`), family-specific startup/version
  markers, bounded Codex first-run `Escape` dismissal, focus-report exemption
  for bracketed paste/Unicode input, and the OpenCode-only paste-indicator gate.
- `feasibility/s1-terminal/src/renderer.ts`: focus-report handling needed for
  the input classification.
- `feasibility/s1-terminal/src/process-tree-9e.ts`: PID-reuse guard retained
  (a non-root process created before the root is excluded).
- `feasibility/s1-terminal/scripts/run-cli-launch.js`,
  `run-cli-tui-startup.js`, `run-cli-resize.js`: `TIYE_S1_FAMILY` parameter and
  matching assertions.

These are feasibility-harness changes only; no product code was modified.

## Commands

```powershell
cd feasibility/s1-terminal
npm run build

# Codex
$env:TIYE_S1_FAMILY = "codex"
node scripts/run-cli-launch.js
node scripts/run-cli-tui-startup.js
node scripts/run-cli-tui-startup.js --input-probe
node scripts/run-cli-tui-startup.js --edit-probe
node scripts/run-cli-tui-startup.js --paste-probe
node scripts/run-cli-tui-startup.js --unicode-probe
node scripts/run-cli-resize.js

# Claude Code
$env:TIYE_S1_FAMILY = "claude"
# same seven commands

# OpenCode
Remove-Item Env:TIYE_S1_FAMILY
# same seven commands
```

Logs and screenshots were copied from `feasibility/s1-terminal/dist/` into the
per-CLI directories under `output/s1-terminal/`.

## Evidence index

| Directory | Contents |
|---|---|
| `output/s1-terminal/codex/` | Seven run logs, startup shot, before/after pairs for input/edit/paste/unicode/resize |
| `output/s1-terminal/claude/` | Same layout |
| `output/s1-terminal/opencode/` | Same layout; failure screenshots show the empty composer, updater banner and plugin overlay |

## Architecture consequence

- Codex and Claude Code are usable as **display-channel candidates** for the
  tested Windows slices; neither is a fully supported member.
- OpenCode 2.2.5 is **not** S1-qualified on this host: multiline paste and
  Unicode display fail, and two probes cannot verify exact teardown.
- Gemini remains untested because it is not installed.
- Capability data is recorded as draft feasibility data in
  [`output/capability-data/`](../capability-data/README.md); nothing is promoted
  to production and no provider integration or release is admitted.

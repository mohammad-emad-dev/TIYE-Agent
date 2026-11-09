# S6 — WSL real-CLI cohort (C1 result form)

**Date:** 2026-11-10 (cohort captured 2026-11-09/10 local)
**Test:** S6 steps 1–9 with the retained Linux Codex CLI 0.157.1
**Result:** **Partial** — inventory, paths/filesystems, environment propagation,
ConPTY version launch and stdio MCP attachment qualified in bounded slices;
the TUI composer and the model turn are blocked by missing WSL authentication.
**Scope:** no product implementation; no provider login or credential read; no
host network change; fixed queries and disposable fixtures only.

## C1 result form

| Field | Entry |
|---|---|
| Test and CLI | S6 WSL — retained Linux Codex CLI 0.157.1 under Ubuntu 26.04.1 LTS, launched from Windows 11 through `wsl.exe` and ConPTY |
| Tool versions | Windows 11 Pro 10.0.26300; Node v26.7.0; Electron 38.8.6; node-pty 1.1.0; WSL 2; Ubuntu 26.04.1 LTS; kernel 6.18.33.2-microsoft-standard-WSL2; Linux Git 2.53.0; Linux Python 3.14.4; Linux Codex 0.157.1 (retained at `/home/mohammad/.local/share/tiye-feasibility/codex-0.157.1-rx5vmnt1/package/bin/codex`, SHA-256 `3e2584f3…2983f970`) |
| Result | Partial |
| What worked | Distribution and user discovery; exact Linux process identity (PID + `/proc/<pid>/stat` start ticks + boot-ID hash); fixed-PATH discovery; `wslpath` translations and both round trips; Linux Git on drvfs and ext4 fixtures; cross-filesystem byte reads; WSLENV allowlist propagation; ConPTY launch of `codex --version`; Codex TUI drawing (composer + sign-in overlay); PTY teardown with verified identity cleanup; stdio MCP server attach through `codex exec` (`initialize`, `notifications/initialized`, `tools/list`) |
| What did not | The retained WSL Codex is not authenticated. `codex exec` stopped at `401 Unauthorized` before any model turn, so no `report_result` call. The TUI showed the ChatGPT/API-key sign-in overlay and the injected composer token was not observed. Full Electron-renderer → `wsl.exe` → real-CLI parity was not exercised (the S1 TUI harness refuses `wsl.exe`; see limitation). Windows-tool-server transport was not re-run for a real CLI. Graceful stop-all/quit and abnormal main crash were not run with the real CLI. |
| Workaround used | None for authentication: no login, token copy, credential read or provider request beyond the unauthenticated attempt was performed. The PTY probe launches `wsl.exe` directly from Node with the same node-pty/ConPTY stack rather than through the Electron renderer; it therefore qualifies the WSL/PTY layer, not renderer parity. `--ignore-user-config` and a fresh `CODEX_HOME` isolate the probe from the user's configuration. |
| Measurements | Inventory: `wsl --list --verbose` exit 0; UID 1000; networking mode `nat`; no `codex`/`claude`/`opencode`/`gemini`/`node`/`npm` on the fixed PATH. Paths: drvfs init/add/commit/status/head = 77/109/144/70/15 ms; ext4 = 4/2/4/2/1 ms (40 × 1 KiB files plus one Unicode-named file); cross-read SHA-256 matched. Environment: six of six checks true, exit 0. PTY `--version`: ready 1211 ms, 89 bytes, exit 0, identity gone after PTY kill (2618 ms), cleanup verified. PTY TUI: composer + sign-in overlay at 3673 ms, 2203 bytes; token `tiyes6probe7q3z9` not observed; Enter never sent; identity gone after PTY kill (2618 ms), cleanup verified. Tool attach: 15 779 ms, exit 1, methods `initialize,notifications/initialized,tools/list`, fixture PID gone, no exact-binary process remained. |
| Evidence (logs) | [inventory.json](inventory.json), [paths.json](paths.json), [env.json](env.json), [pty-version.json](pty-version.json), [pty-version.log](pty-version.log), [pty-tui.json](pty-tui.json), [pty-tui.log](pty-tui.log), [tool-attach.json](tool-attach.json), [tool-attach.stderr.log](tool-attach.stderr.log), [tool-attach.calls.jsonl](tool-attach.calls.jsonl). Preserved first attempts: `inventory-attempt1.*`, `paths-attempt1.*`, `env-attempt1.*`, `pty-tui-attempt1.*`. |
| Architecture impact | Keep Windows team tools loopback-bound and use the tested interop/pipe relay for WSL NAT. Do not rely on the Linux `PATH` to find a WSL CLI; use configured candidate locations and verify the version. Validate path inputs above `wslpath`. Treat WSL members as requiring a user-controlled login inside WSL; the app must not read, copy or relay credentials. One Git side per project remains the cross-worktree rule. |

## Step results

| Step | Result | Observation |
|---|---|---|
| 1. Detect WSL and distributions | **Pass (bounded)** | `wsl.exe --list --verbose` exit 0; UTF-16LE decoded; `* Ubuntu Running 2` and `docker-desktop Running 2`. |
| 2. Detect each CLI and version | **Pass (bounded)** | Fixed PATH has Git and Python only; no provider CLI, Node or npm. The retained Codex 0.157.1 is **outside** the fixed PATH and reports `codex-cli 0.157.1`. Detection must search configured locations, not just `PATH`. |
| 3. Launch through `wsl.exe` in a pseudo-terminal | **Partial** | `codex --version` through `wsl.exe` + ConPTY passed (exit 0, exact identity cleanup). The TUI drew `OpenAI Codex (v0.157.1)`, the composer line `› Ask Codex to do anything`, and the sign-in overlay. The injected composer token was not visible, so composer input is unproven. |
| 4. Run on the Windows file system, then the Linux file system | **Pass (bounded Git slice)** | Linux Git completed init/add/commit/status/head and a clean status on both sides. drvfs was 15–70× slower than ext4 in this single fixed-order capture; this is not a benchmark. The earlier 16 October cohort saw `chmod .git/config.lock: Operation not permitted` on a different Windows-mounted root; today's capture succeeded there, so the host's drvfs behavior is not stable enough to generalize from either observation alone. |
| 5. Translate paths both ways | **Pass for tested paths; fail for validation** | `C:\…\tiye s6 路径-…` → `/mnt/c/…/tiye s6 路径-…`; `D:\TIYE Agent` → `/mnt/d/TIYE Agent`; `/home/mohammad` → `\\wsl.localhost\Ubuntu\home\mohammad`; Unicode Linux path → Windows; both round trips matched. **`wslpath -u 'relative\path'` exited 0 with `relative/path` and `wslpath -u ''` exited 0 with `.`** — it does not refuse invalid input. Validate above it. |
| 6. Connect to the Windows team-tools server | **Not re-run; prior mock evidence only** | Today's `wslinfo --networking-mode` = `nat`. The 16 October mock cohort found Ubuntu → Windows `127.0.0.1` refused (`ConnectionRefusedError`), while the Windows `node.exe` interop/stdin relay completed the same authenticated MCP exchanges; mirrored mode was not enabled or tested. See [output/s6-connectivity/README.md](../s6-connectivity/README.md). No real CLI used that route. |
| 7. Pass environment variables into WSL | **Pass** | WSLENV allowlist delivered the sentinel, Git author name/email, and the `/p` translated Windows path; the unlisted variable stayed absent; `/usr/bin/git var GIT_AUTHOR_IDENT` resolved the supplied identity. |
| 8. Lifecycle and cleanup | **Partial** | Preflight refuses a launch if the exact binary is already running. PTY kill left no verified Linux identity and no exact-binary process; cleanup verified for both PTY runs and the tool-attach run. Graceful stop-all/quit and abnormal main crash were **not** run with the real CLI. node-pty printed `Error: AttachConsole failed` from `conpty_console_list_agent.js` during teardown; this is a known node-pty helper race, not a surviving CLI or failed cleanup. |
| 9. Cross-side Git worktrees | **Not re-run; prior evidence only** | The 16 October cohort refused both foreign reads: Linux Git on a Windows-created linked worktree exited 128 (`not a git repository`); Windows Git on a Linux worktree through `wsl.localhost` exited 128 (`detected dubious ownership`). Rule: one Git side per project. See [output/s6-cross-git/README.md](../s6-cross-git/README.md). |

## Tool attachment (stdio MCP)

The probe ran:

```text
wsl.exe -d Ubuntu --exec /usr/bin/env -i PATH=<fixed> \
  HOME=<fresh> CODEX_HOME=<fresh> TMPDIR=<fresh> TERM=dumb LC_ALL=C.UTF-8 \
  <retained codex> exec --skip-git-repo-check --ephemeral --ignore-user-config \
  -C <fresh work> \
  -c mcp_servers.tiye.command="/usr/bin/python3" \
  -c mcp_servers.tiye.args=["/mnt/d/TIYE Agent/feasibility/s6-wsl/real-cli/mcp_fixture.py"] \
  -c mcp_servers.tiye.env={TIYE_CALL_LOG="<fresh log>"} \
  -c mcp_servers.tiye.default_tools_approval_mode="approve" \
  "<fixed prompt: call report_result once>"
```

The fixture recorded `server-start` (PID 13435), `initialize`,
`notifications/initialized`, and `tools/list`. The model turn then failed with
`401 Unauthorized: Missing bearer or basic authentication in header` after
repeated WebSocket 401s (reconnect 2/5–5/5) and HTTPS retries (1/5–5/5). Exit 1
at 15.8 s. The fixture PID was gone after exit, no exact-binary process
remained, and cleanup was verified.

**Outcome:** `attached-auth-blocked`. The MCP configuration and stdio transport
work before authentication; a tool round trip cannot be claimed without a
user-controlled login.

## Blockers and limitations

1. **WSL Codex is not logged in.** No user login was attempted and no credential
   was read, copied or stored. A full S2/S6 tool round trip inside WSL needs the
   owner to sign in inside WSL first.
2. **Full renderer parity is unqualified.** The S1 TUI probes require the
   launched basename to match the selected CLI family and therefore refuse
   `wsl.exe`. Changing that would be a harness change; this cohort instead used
   node-pty directly and does not claim Electron-renderer → WSL parity.
3. **Transport is prior mock evidence.** The real-CLI cohort used stdio MCP,
   which bypasses the Windows HTTP listener. The NAT loopback refusal and
   interop relay result were observed in the earlier mock cohort, not here.
4. **Lifecycle is partial.** PTY-kill cleanup passed; graceful quit and abnormal
   main crash were not run with the real CLI.
5. **No model request completed.** `--version` and TUI startup are display/launch
   evidence only. The only model attempt stopped at authentication.
6. **Single observations.** Path timings, drvfs/ext4 comparison and TUI timing
   are one-shot; the earlier drvfs result contradicts today's, so neither is a
   general drvfs claim.
7. **First TUI attempt was discarded.** A broad marker (`/Sign ?in|ChatGPT|Codex/i`)
   matched `codex_home` in a PATH-alias warning at 653 ms. The retained first
   attempt is `pty-tui-attempt1.*`; the final run uses explicit composer and
   sign-in markers plus a 2 s settle. This is a harness correction, not a CLI
   failure.
8. **Node-pty teardown warning.** `AttachConsole failed` is recorded as a helper
   race; cleanup was verified independently by Linux identity and exact-binary
   enumeration.

## Evidence index

| File | Purpose |
|---|---|
| `inventory.json`, `inventory.summary.txt` | WSL list, fixed-PATH discovery, retained candidate version |
| `paths.json`, `paths.err` | OS/kernel/UID, tools, `wslpath` cases, drvfs/ext4 Git fixtures, cross-read |
| `env.json`, `env.summary.txt` | WSLENV allowlist, path translation, Git author resolution |
| `pty-version.json`, `.log`, `.summary.txt` | ConPTY launch of `codex --version`, identity, cleanup |
| `pty-tui.json`, `.log`, `.summary.txt` | ConPTY TUI composer/sign-in, token input, cleanup |
| `pty-tui-attempt1.*` | Preserved false-positive marker attempt |
| `tool-attach.json`, `.stdout.log`, `.stderr.log`, `.calls.jsonl`, `.summary.txt` | stdio MCP attach, auth stop, fixture cleanup |
| `inventory-attempt1.*`, `paths-attempt1.*`, `env-attempt1.*` | Preserved harness-error attempts |

## Commands

```powershell
# Inventory and environment
node feasibility/s6-wsl/real-cli/run-inventory.js --out output/s6-real-cli
node feasibility/s6-wsl/real-cli/run-env.js --out output/s6-real-cli

# Paths and filesystems (probe source on stdin, result on stdout)
wsl.exe -d Ubuntu --exec /usr/bin/env -i PATH=<fixed> LC_ALL=C.UTF-8 `
  python3 - < feasibility/s6-wsl/real-cli/probe.py > output/s6-real-cli/paths.json

# PTY
node feasibility/s6-wsl/real-cli/run-pty.js --mode version --out output/s6-real-cli
node feasibility/s6-wsl/real-cli/run-pty.js --mode tui --input yes --out output/s6-real-cli

# Tool attachment
node feasibility/s6-wsl/real-cli/run-tool-attach.js --out output/s6-real-cli
```

All commands were run from the repository root. `run-pty.js` and
`run-tool-attach.js` refuse to start if the exact Linux binary is already
running, and only terminate processes whose PID + start ticks match a
probe-owned identity.

## Architecture consequence

- S6 remains **Partial**; all nine coverage rows remain partial.
- Keep Windows team tools loopback-bound; use the tested interop pipe relay for
  WSL NAT if a network transport is required.
- Add a configured-location search for Linux CLIs; the fixed `PATH` is not
  sufficient.
- Add validation above `wslpath`; do not pass relative or empty strings through.
- WSL login is user-controlled inside the distribution. No app-side credential
  handling is justified by this cohort.
- Do not mix Git sides in one project until a cross-side worktree cohort passes.
- No capability-data promotion, provider integration or release follows from
  this result.

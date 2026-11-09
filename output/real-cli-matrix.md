# Real-CLI summary matrix (C2)

**Date:** 2026-11-10
**Scope:** Only cells with real-CLI evidence from the unlocked S1/S2/S6 cohorts are
filled. “Not tested” means no bounded real-CLI observation exists — it is **not**
a failure and must not be inferred as unsupported behavior.

| Item | Claude Code | Codex | Gemini CLI | OpenCode |
|---|---|---|---|---|
| Version tested | 2.1.321 (Windows, `--version`) | 0.164.0 (Windows, `--version`); 0.157.1 retained in WSL for S6 | Not tested — command absent | 2.2.5 (Windows, `--version`); TUI showed updater churn (`2.2.6` offered) |
| S1 display | **Pass** for launch, startup marker, input, edit, paste, Unicode and resize on Windows; exact teardown every probe | **Pass** for the same seven slices on Windows; exact teardown every probe; first-run notices dismissed with bounded Escape | Not tested | **Partial/Fail**: launch, startup, input pass; edit/resize inconclusive on teardown identity; multiline paste and Unicode not displayed; 5 failed plugins and updater active |
| S2 how tools attach | Not tested (S4 route unreviewed) | **Stdio MCP via `mcp_servers.*` config**; CLI launches the fixture; `initialize` → `tools/list` → `tools/call` observed | Not tested | Not tested on 2.2.5 (prior 2.0.28 permission work is not an attach result) |
| S2 reliability (of 10) | Not measured | **Not measured** — one run per scenario | Not measured | Not measured |
| S2 briefing method | Not tested | **Positional prompt to `codex exec`**; working folder via `-C`; task and `report_result` instruction in one prompt | Not tested | Not tested |
| S2 permission options available | Not tested | `-s read-only` (smoke) and `-s workspace-write` + `windows.sandbox="elevated"` (T1) tested; `never` and `on-request` policies not exercised; MCP approval mode `approve` and `prompt` observed | Not tested | Not tested on 2.2.5; prior OpenCode 2.0.28 evidence exists in `feasibility/s2-control/capabilities/opencode-permissions.json` |
| S2 approval detection | Not tested | **Pattern only in exec mode**: `MCP tool call requires approval, but approval policy is never` — a fail-closed error, not a prompt; interactive TUI prompt not observed | Not tested | Not tested on 2.2.5 |
| S2 error patterns | Not tested | **Auth**: 401 `Missing bearer or basic authentication in header`, 5 WSS + 5 HTTPS retries, `turn.failed`. **Model**: 400 `model_not_found`. **Network**: `workspace routing discovery failed`, WSS→HTTPS fallback, `turn.failed`. **Rate limit**: not tested | Not tested | Not tested |
| S2 resume support | Not tested | **Yes** — `codex exec resume <thread-id>` from the original working directory; thread id from `thread.started`; retained context observed | Not tested | Not tested |
| S3 author kept | Not tested with a real CLI | Not tested with a real CLI | Not tested | Not tested with a real CLI |
| S3 push: engine approval works | Not tested with a real CLI | Not tested with a real CLI | Not tested | Not tested with a real CLI |
| S3 push: hook refuses, bypass recorded | Not tested with a real CLI | Not tested with a real CLI | Not tested | Not tested with a real CLI |
| S3 read-only: supported or unsupported | Not tested with a real CLI | Not tested with a real CLI | Not tested | Not tested with a real CLI |
| S3 out-of-worktree write detected? | Not tested with a real CLI | Not tested with a real CLI | Not tested | Not tested with a real CLI |
| S4 login class (A to D) | Not assigned — route unreviewed | **A by owner exception** — verbal-only, not evidence-qualified (2026-11-09) | Not assigned — command unavailable | Not assigned — route unreviewed |
| S6 through WSL | Not tested | **Partial** — retained 0.157.1; inventory, paths, env, ConPTY `--version`, TUI composer/sign-in overlay, PTY cleanup and stdio MCP attach passed; model turn stopped at 401 before a tool call; renderer parity and graceful quit not run | Not tested | Not tested |

## Reading notes

- **S1 display** is display/input only: no Enter, no prompt submission and no
  model behavior. OpenCode's edit and resize results are visually consistent
  but inconclusive because helper identities exited before the main kill.
- **S2** was run only for Codex. Claude Code, Gemini CLI and OpenCode remain
  unqualified at S4, and the owner exception covers only the OpenAI Codex route.
- **S2 reliability** requires repeated runs; this cohort has single observations
  and does not produce a score out of 10.
- **S3** has no real-CLI evidence in this cohort. Do not fill its cells from mock
  or prior contract tests.
- **S6** evidence is for Codex only; the absence of the other columns is a scope
  limit, not a platform finding.
- The OpenCode 2.0.28 permission file is prior, separate evidence and does not
  upgrade the 2.2.5 row.

## Sources

- `output/s1-terminal/RESULT.md`
- `output/s2-control/codex/RESULT.md`
- `output/s6-real-cli/RESULT.md`
- `output/s4-route-qualification/RESULT.md`
- `output/capability-data/README.md`

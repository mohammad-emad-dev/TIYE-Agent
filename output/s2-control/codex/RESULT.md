# S2 — Codex control cohort (C1 result form)

**Date:** 2026-11-10 (cohort captured 2026-11-09 local)
**Test:** S2 end-to-end task/tool round trip, approval, native errors,
authentication, network, cancellation, hang and resume — Codex only
**Result:** **Pass for the Codex bounded scenarios; Partial overall** — the
Claude Code, Gemini CLI and OpenCode S2 cohorts were not run because their S4
routes are unqualified, and rate-limit/crash scenarios were not run.
**Scope:** disposable fixture repositories, one stdio MCP fixture, fixed prompts,
no product code, no credential read or copy.

## C1 result form

| Field | Entry |
|---|---|
| Test and CLI | S2 task→tool→report round trip and failure behavior, Codex CLI 0.164.0 on Windows 11 |
| Tool versions | Windows 11 Pro 10.0.26300; Codex 0.164.0 at `C:\Users\Mohammad\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe`; Node v26.7.0; default account model (the CLI did not print the model name in the retained JSONL; the 400 response identifies a ChatGPT account); stdio MCP fixture `feasibility/s2-control/codex/stdio-team-tools.js` |
| Result | **Pass (bounded)** for T1 round trip, approval denial, auth failure, native model error, injected network failure, resume and cancellation; **Partial** for hang; **not tested** for the other three CLIs and for rate limits/crash |
| What worked | `codex exec --json` completed a real task (added `clamp.js` + five `node:test` cases, ran `npm test` 5/5) and called the attached `report_result` tool once with a result; `turn.completed`. A `default_tools_approval_mode="prompt"` MCP call failed closed with a visible error while the turn completed. A fresh `CODEX_HOME` produced a clean 401 and `turn.failed`. An unsupported model produced a typed 400 `model_not_found`. An injected dead proxy produced retry/fallback output and `turn.failed`. `codex exec resume` restored the thread and correctly restated the prior task and test result. SIGINT during a long shell command terminated the run (wrapper exit 130). |
| What did not | Approval was only observed as an exec-mode error, not as an interactive approval UI — in this non-interactive configuration the approval policy was `never`, so no prompt was shown. Cancellation is ambiguous: SIGINT killed the process, but the agent still emitted `done` and `turn.completed` after three `runner pipe closed before exit` tool errors. The hang probe ended at the 75 s outer timeout (`exit=124`) with the MCP call still `in_progress`; fixture process cleanup after the timeout was **not** enumerated. Rate-limit and crash scenarios were not run. No other CLI was run. |
| Workaround used | The first T1 invocation failed on an empty `-C` value caused by the probe's own path conversion (exit 2, no model request). The runner was corrected to pass an explicit `cygpath -m` work directory. The approval probe intentionally requested `prompt` mode to observe the fail-closed path in a non-interactive runner. No CLI configuration or credential was changed. |
| Measurements | T1: exit 0; `report_result` arguments `{status:"done", summary:"Added clamp.js and five node:test cases in clamp.test.js; npm test passed (5/5)."}`; MCP result text `report_result accepted for member-a: done`; `npm test` 5 pass / 0 fail; `turn.completed` usage input 184 892 / output 1 168. Approval: exit 0; tool item `failed` with `MCP tool call requires approval, but approval policy is never`; `turn.completed`. Auth: exit 1; repeated WSS 401s (reconnect 2/5–5/5), HTTPS fallback, HTTPS 1/5–5/5, `turn.failed`. Model: exit 1; HTTP 400 `model_not_found`. Network: exit 1; `workspace routing discovery failed`, WSS→HTTPS fallback, `turn.failed`. Resume: first attempt exit 2 (`resume` rejects `-C`), second exit 0 with the retained context. Cancellation: exit 130; three 60-second PowerShell items failed with `runner pipe closed before exit`, then `done` and `turn.completed`. Hang: exit 124 at 76 s; MCP `report_result` still `in_progress`; stderr `code mode host closed its stdout`. |
| Evidence | `output/s2-control/codex/t1-round-trip/` (calls, task output, tests, git state); `approval-prompt/`; `auth-missing/`; `native-error-model/`; `network-injected-proxy/`; `resume/`; `cancellation-signal/`; `hang-injected/` |
| Architecture impact | Codex provides a working stdio tool attachment and a usable JSON error surface for auth/model/network failures. Approval must be designed as an app-level gate: in non-interactive exec mode a “prompt” policy fails closed and cannot ask the user. Cancellation needs the app to own process teardown and to treat a terminal `turn.completed` after a signal as suspect. Resume works only when the thread id and the original work directory are preserved. No capability-data promotion follows. |

## Scenario results

| Scenario | Command shape (abridged) | Observed | Verdict |
|---|---|---|---|
| T1 round trip | `codex exec --ignore-user-config --skip-git-repo-check -C <fixture> -s workspace-write -c 'windows.sandbox="elevated"' -c 'mcp_servers.tiye.command="node"' -c 'mcp_servers.tiye.args=[<fixture>]' -c 'mcp_servers.tiye.env={TIYE_MEMBER="member-a",TIYE_CALL_LOG="<log>"}' -c 'mcp_servers.tiye.default_tools_approval_mode="approve"' --json '<task + report_result prompt>'` | Files created, `npm test` 5/5, one `report_result` call completed, exit 0 | **Pass** |
| Approval — no prompt possible | Same attachment with `default_tools_approval_mode="prompt"`; prompt asks only for the tool call | MCP item `failed`: `MCP tool call requires approval, but approval policy is never`; agent explains it did not retry; exit 0 | **Pass (fail-closed observed)** |
| Authentication missing | `CODEX_HOME=<fresh empty> codex exec … --json 'Reply with only the word hello.'` | 401 `Missing bearer or basic authentication in header`; WSS reconnect 2/5–5/5, HTTPS fallback, HTTPS 1/5–5/5; `turn.failed`; exit 1 | **Pass (native error surface)** |
| Native model error | `codex exec -m tiye-nonexistent-model-xyz …` | 400 `invalid_request_error`, `model_not_found`, “not supported when using Codex with a ChatGPT account”; exit 1 | **Pass (native error surface)** |
| Injected network failure | `HTTPS_PROXY/HTTP_PROXY/ALL_PROXY=http://127.0.0.1:9 codex exec …` | `workspace routing discovery failed`, WSS→HTTPS fallback, `turn.failed`; exit 1 | **Pass (native error surface)** |
| Resume | `codex exec resume --ignore-user-config --skip-git-repo-check --json <thread-id> '<state the completed task>'` | First attempt exit 2: `codex exec resume` does not accept `-C` (`tip: to pass '-C' as a value, use '-- -C'`); second attempt ran from the fixture directory and exited 0; thread id echoed; retained summary “Created `clamp.js` and five `node:test` cases in `clamp.test.js`; all 5 tests passed.” | **Pass (second attempt)** |
| Cancellation | `codex exec … 'Run Start-Sleep -Seconds 60 …'` then `kill -INT <pid>` after the command item appears | Wrapper exit 130; three tool attempts failed with `runner pipe closed before exit`; agent then said `done`; `turn.completed` | **Partial / ambiguous** |
| Injected hang | MCP fixture with `TIYE_FIXTURE_HANG=1`; 75 s outer `timeout` | exit 124 at 76 s; `report_result` item `in_progress`; `code mode host closed its stdout`; no completed turn | **Partial (timeout bound only)** |
| Rate limit | — | Not run | **Not tested** |
| Crash / abnormal exit | — | Not run | **Not tested** |

## What is proven, and what is not

- **Tool attachment and one round trip are proven for Codex** through a real
  stdio MCP server, with the CLI itself launching the fixture.
- **The approval result is a non-interactive fail-closed result.** It does not
  prove what an interactive Codex prompt looks like, how a user approves or
  denies, or how a denial is reported to the Leader.
- **Cancellation did not produce a clean cancelled state.** The process was
  signalled, yet the CLI emitted a completed turn. An app must not trust the
  final event after a cancellation request; it should kill and verify its own
  process tree and classify the run by its own signal.
- **The hang probe shows the outer timeout works**, not that Codex recovers.
  The fixture process state after the timeout was not enumerated, so an orphan
  cannot be ruled out from this evidence.
- **Resume depends on thread id + working directory.** `codex exec resume` rejects
  `-C`; the successful attempt ran from the fixture directory. A product must
  persist both the thread id and the working directory.

## Blockers

1. **Claude Code, Gemini CLI and OpenCode S2 were not run.** Their S4 routes
   remain `unreviewed`, `integrationEligible: false`; only the Codex route has an
   owner exception. Running them would exceed the authorized S4 scope.
   See `output/s4-route-qualification/RESULT.md`.
2. **Gemini CLI is not installed**, and installing it is outside the cohort
   rules.
3. **Interactive approval UI was not exercised.** `codex exec` has no approval
   prompt; a TUI-based approval cohort would need separate authorization.
4. **Rate-limit and crash behavior were not run.** The plan lists them; this
   cohort is bounded to the scenarios above.
5. **Single observations.** Each scenario was run once (resume twice, first
   attempt invalid). Flake rates are not measured.

## Evidence index

| Directory | Contents |
|---|---|
| `t1-round-trip/` | `calls.jsonl` (one tool call), `codex-exec.jsonl`, `codex-exec.err`, `clamp.js`, `clamp.test.js`, `package.json`, `test.log`, `git-state.txt`, `server.js` |
| `approval-prompt/` | `codex-exec.jsonl` (failed MCP item), `codex-exec.err` |
| `auth-missing/` | `codex-exec.jsonl` (401 retries, `turn.failed`), `codex-exec.err` |
| `native-error-model/` | `codex-exec.jsonl` (400 `model_not_found`), `codex-exec.err` |
| `network-injected-proxy/` | `codex-exec.jsonl` (routing discovery failures), `codex-exec.err` |
| `resume/` | `thread.txt`, `codex-exec.jsonl`, `codex-exec.err` |
| `cancellation-signal/` | `codex-exec.jsonl`, `codex-exec.err`, `kill.err` |
| `hang-injected/` | `codex-exec.jsonl`, `codex-exec.err`, `result.txt` |

## Commands

All runs used the disposable fixture at `/tmp/s2-codex-t1b-*`, with a committed
`package.json`, `README.md` and copied `server.js`. The task prompt was fixed
and is reproduced in `t1-round-trip/codex-exec.jsonl`/the scenario logs.

```bash
codex exec --ignore-user-config --skip-git-repo-check -C "$W" \
  -s workspace-write -c 'windows.sandbox="elevated"' \
  -c 'mcp_servers.tiye.command="node"' \
  -c 'mcp_servers.tiye.args=["D:/TIYE Agent/feasibility/s2-control/codex/stdio-team-tools.js"]' \
  -c 'mcp_servers.tiye.env={TIYE_MEMBER="member-a",TIYE_CALL_LOG="<log>"}' \
  -c 'mcp_servers.tiye.default_tools_approval_mode="approve"' --json '<task>'
```

Variants: `default_tools_approval_mode="prompt"` for approval; empty
`CODEX_HOME` for auth; `-m tiye-nonexistent-model-xyz` for the model error;
dead proxy environment variables for network; `codex exec resume …` for resume;
`kill -INT` after the shell item appears for cancellation; `TIYE_FIXTURE_HANG=1`
plus a 75 s `timeout` for the hang.

## Architecture consequence

- Codex is the only CLI with an end-to-end S2 round trip in this cohort.
- **Approvals are app-owned.** The Leader must decide and record approvals; the
  CLI's non-interactive exec mode cannot ask, and a `prompt` policy fails closed.
- **Cancellation is app-owned.** Kill and verify the process tree; do not treat
  a terminal event after a signal as success.
- **Resume requires persisted thread id and working directory.**
- **Native error surfaces are usable** for auth (401), unsupported model (400
  `model_not_found`), and network (routing failure), but their text is
  provider-specific and must be mapped by the app.
- No capability-data promotion, provider integration or release follows.

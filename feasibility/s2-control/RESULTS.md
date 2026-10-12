# S2.1 result — OpenCode MCP attachment without a model request (feasibility slice)

**Verdict: PARTIAL** (12 October 2026, Windows 11; `npm run probe` →
`PARTIAL` line, `evidence/latest.json` `result="partial"`; rerun
reproducible across two consecutive runs).

## Scope

S2.1 attaching the tools only (Test Plan S2.1 steps 1–4 + A5 team-tools
server on loopback with per-member tokens). Architecture 4.2 tools
`report_result`, `ask_leader`, `delegate_task`. No model request; S2.2 NOT
claimed. S1 files untouched.

## Method

- `src/team-tools-server.js`: stateful Streamable HTTP server on the
  official `@modelcontextprotocol/sdk` 1.32.1 transport (the one justified
  protocol dependency; `POST` + `GET` SSE + `DELETE` all served by the
  SDK). Three tools with minimal zod schemas; `tools/call` returns a
  feasibility ack only ("no engine effect"); schema violations never reach
  handlers. Every `/mcp` request needs a known per-run bearer token
  (`401` first); each SDK session is bound to the member whose token
  opened it (cross-member session use → `401`, unknown session → `404`).
  Logs tool name + member identity + bounded metadata (session
  open/close, validation boolean, top-level argument count) — never
  tokens, session IDs, or argument contents, names, or values.
- `scripts/run-probe.js` (`npm run probe`): per-run random tokens (never
  printed/hardcoded), loopback server, installed `opencode mcp list`
  with disposable config (`OPENCODE_CONFIG_CONTENT`, then
  `OPENCODE_CONFIG` temp-file fallback) for `member-a` / `member-b`, plus
  in-process `debug config` per member project, a private
  `api --standalone GET /api/mcp` per member project, per-phase SDK
  session-contact counts on the fixture, and SDK-client protocol proof
  (`initialize` + `tools/list` + one bounded `tools/call` ack +
  `DELETE`, cross-member `401`, bad/missing-token `401` incl. `GET`).
  `netstat` loopback-bind check, global/project untouched check,
  redacted `evidence/latest.json`. Bounded timeouts; server SIGTERM +
  temp-dir removal on handled paths.
- Docs used: remote MCP `type="remote"`, `url`, `headers`,
  `oauth=false`; `OPENCODE_CONFIG` / `OPENCODE_CONFIG_CONTENT`; config
  files merge (no total-isolation claim).

## Outcome

| Check | Result | Evidence |
|---|---|---|
| Server binds loopback-only | Pass | `netstat`: `TCP 127.0.0.1:<port> LISTENING`, no `0.0.0.0:<port>` wildcard (per-run port; see `evidence/latest.json`) |
| Per-member bearer auth | Pass | Bad-token `POST`/`GET` 401, missing-auth `POST` 401, all before SDK handling |
| SDK sessions + ownership | Pass | Session per member; cross-member session use 401; `DELETE` closes sessions |
| Three tools listed at protocol level | Pass | SDK `listTools` returns exactly `report_result,ask_leader,delegate_task` for both members |
| Bounded `tools/call` ack + attribution | Pass | `report_result` ack names the calling member for both; server log shows `tool-call … tool=report_result` with `member-a`/`member-b` |
| Log hygiene | Pass | No token substring, no session ID, no argument values/names (`leaksToken=false leaksContent=false`) |
| Global/project config untouched | Pass | Existence+size+mtime unchanged for global `~/.config/opencode/opencode.json`, repo-root and fixture `opencode.json` (all absent before/after) |
| Disposable config plumbing loads | Pass | `opencode debug config` in per-member temp CWD shows the `tiye-team-tools` remote document (`Authorization: ***`, `disabled: false`) |
| `opencode mcp list` shows server/tools | **Not proven** | Default `mcp list` prints `No MCP servers configured` for both members (exit 0), via content and file config |
| Private `api --standalone` shows server | **Not proven** | `data=[]` for both member projects (exit 0) despite correct CWD location |
| Model round trip (S2.2) | Not attempted | No prompt submitted, no model called |

## Distinguishing measurement (observed, not inferred)

Per-phase SDK `session-open` counts on the fixture server:

- `mcp list` phase: **0 sessions** for both member tokens — the CLI never
  dialed the fixture. Consistent with `mcp list` serving from the
  persistent background service (live at `127.0.0.1:49374` during the
  run; `mcp list` accepts no `--standalone` flag), but the service's
  internals were not inspected, so this remains consistency, not proof.
- `api --standalone` phase: **1 session per member token** — the private
  instance loaded the disposable project config, dialed the fixture, and
  completed `initialize` with the member token, yet still reported
  `data=[]`. So the handshake path (config → dial → SDK session) works
  against a private instance; why the server is then absent from its
  listing is unobserved by this fixture (it logs `tools/call`, not
  whether the CLI issued `tools/list`).

Net: transport incompatibility at the handshake level is ruled out for a
private instance; CLI-side tool exposure is still **UNPROVEN**. No S2.2
claim.

## Standing caveats

- Config merge: disposable config adds on top of global settings; total
  isolation from global settings is NOT claimed.
- Loopback + bearer tokens are feasibility-only; no production-auth claim.
- This acknowledgment-only fixture exposes `delegate_task` to both test
  members and does not enforce Leader-only tool access. S2.4 still needs
  that authorization test before any engine effect is attached.
- Exit codes: runner uses 0 pass / 2 partial / 1 fail; the `rtk` shell
  wrapper reports any non-zero as 1, so the source of truth is the
  `PARTIAL` stdout line and `evidence/latest.json`.
- S1 files and other modes preserved (only `feasibility/s2-control/`
  added; Temp-only diagnostics never committed).

## Existing-check regression

- `rtk npm run check` in `feasibility/s1-terminal` (tsc + esbuild): PASS
  (rerun 12 Oct 2026 after this slice; no S1 file modified).

## Versions tested

Windows 11; Node.js v26.7.0; `@modelcontextprotocol/sdk` 1.32.1 (exact);
installed OpenCode v2.0.22 (version via `--version`, no model request).

## What remains unproven

S2.2 task round trip (`report_result` reliability, `ask_leader` behavior,
nudges); S2.3 briefing delivery; S2.4 permissions mapping; S2.5
approval/error signals; CLI-side tool exposure (why a session-holding
private instance still lists `data=[]`); vendor-CLI parity beyond
OpenCode; WSL (S6).

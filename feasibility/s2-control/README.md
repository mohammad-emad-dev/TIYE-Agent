# TIYE S2.1 control-channel attachment probe (feasibility slice, no model)

Bounded slice of Feasibility Test Plan S2.1 + Architecture 4.2: attach a
minimal team-tools MCP server to installed OpenCode without a model request.

## Scope (exact)

- Loopback-only MCP server (`src/team-tools-server.js` on the official
  `@modelcontextprotocol/sdk` 1.32.1 Streamable HTTP transport — the one
  justified protocol dependency): binds only `127.0.0.1` (ephemeral port),
  requires a distinct per-run bearer token for `member-a` / `member-b`
  before any SDK processing, binds each SDK session to the member whose
  token opened it (cross-member session use → 401, unknown session → 404),
  exposes exactly `report_result`, `ask_leader`, `delegate_task` with
  minimal honest schemas, returns feasibility acknowledgments only
  ("no engine effect"), and logs only tool name + member identity +
  bounded metadata (session open/close, validation boolean, top-level
  argument count). Never logs tokens, session IDs, or argument contents,
  names, or values.
- Runner (`scripts/run-probe.js`, `npm run probe`): generates disposable
  tokens (never printed/hardcoded), starts the server, runs installed
  `opencode mcp list` with disposable config for both member tokens (no
  model request), checks `debug config` plumbing and a private
  `api --standalone` instance per member project, counts SDK sessions each
  CLI phase opened on the fixture (to separate dialing from listing),
  proves `tools/list` + one bounded `tools/call` ack per member plus
  session DELETE, cross-member 401, and bad/missing-token `401` with the
  SDK client at the protocol level over loopback, checks the server log
  for leaks, and records whether global or project config was touched.
  Bounded timeouts, controlled teardown (server SIGTERM + temp-dir
  removal), redacted raw evidence at `evidence/latest.json`.
- Disposable config: `OPENCODE_CONFIG_CONTENT` inline JSON first
  (`mcp.servers.<name> = { type: "remote", url, disabled: false, oauth: false,
  headers: { Authorization: "Bearer <token>" } }`), `OPENCODE_CONFIG`
  temp-file fallback when the CLI listing shows no server; a separate
  temporary project config is used for `debug config` and the private API
  query. It also
  runs `mcp list` from each temporary member project and records fixed,
  allowlisted protocol method names. `cli.beforeSdk` counts sessions and
  `tools/list` requests observed before the SDK client proof starts;
  per-phase counts are observation windows and may miss delayed activity.
  Per official docs, config files **merge**, so total isolation
  from global settings is NOT claimed even when global/project files are
  untouched.

## Non-scope (explicit)

- No model call, no prompt submission, no S2.2 task round trip.
- Tool role restrictions are not implemented in this acknowledgment-only
  fixture; `delegate_task` has no engine effect.
- `opencode mcp list` is a server-status view; if it cannot enumerate exact
  tools, the runner reports PARTIAL with "CLI tool exposure UNPROVEN" and
  proves exact tools only at the protocol level. No pass evidence invented.
- No S1 edits or global-config writes.

## Run

```bat
cd feasibility\s2-control
rtk npm run probe
```

Exit: `0` PASS (CLI lists server + exact tools, protocol confirms),
`2` PARTIAL (protocol confirms, CLI tool exposure unproven),
`1` FAIL (auth/bind/timeout/safety or incompatible interface).

See `RESULTS.md` for the recorded outcome and caveats.

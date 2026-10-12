# TIYE S2 control-channel probes (feasibility slices)

Bounded slice of Feasibility Test Plan S2.1 + Architecture 4.2: attach a
minimal team-tools MCP server to installed OpenCode. The default probe makes
no model request; the separate invocation probe uses the approved free model.

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

- Persistent private CLI: `scripts/persistent-cli.js` resolves the native
  executable beside the installed Windows npm shim, launches
  `serve --stdio --hostname 127.0.0.1 --port 0`, keeps stdin open, and
  uses the existing S1 Job Object controller before API polling. It polls
  `/api/mcp` at most eight times with a four-second bound per request.
  Results contain status/timing fields, session and `tools/list` request
  counts, and verified cleanup of captured process identities. Startup
  output and the generated API password are never persisted. Windows
  only; S1 files are not modified. A connected status proves attachment,
  while exact CLI tool exposure remains a separate, unproven gate.

## Non-scope (explicit)

- The default `probe` command makes no model call or prompt submission.
  Neither command completes the terminal T1 task or S2.2 reliability gate.
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

## Opt-in model invocation

```bat
cd feasibility\s2-control
rtk npm run probe:tool-call
```

`scripts/run-tool-probe.js` launches the native Windows OpenCode CLI with
`run --standalone --model opencode/muse-spark-1.3-contributor-free#xhigh`
and JSON output, once per member. Each disposable project attaches the
same three-tool fixture with its own bearer token and `codemode: false`.
Ordered permission rules deny all actions and allow only
`tiye-team-tools_report_result`. These rules are a probe configuration;
their production permission coverage has not been validated.

The prompt is sent through stdin after Job Object assignment and an
initial process identity capture. It requests one `report_result` with a
unique summary marker and `done` status. The server compares that marker
in memory and logs only a match boolean. A prospective pass requires one
matching server call, the exact structured CLI acknowledgment, no other
observed tool calls, successful CLI exit, complete bounded output,
unchanged selected config fingerprints, and verified cleanup. Prose alone
cannot pass. The positive acknowledgment matcher has not yet been tested
against a successful real CLI tool call.

The model phase has a 120-second deadline after setup. The private CLI
tree is terminated by releasing its owned Job Object, including on a
timeout; there is no service-owned background session to interrupt.
Only the exact created temporary project is removed. No global service
is stopped. Redacted results go to `evidence/tool-call-latest.json`.
Exit `0` means this invocation slice passed; `1` means it failed.
`rtk npm run check` runs offline rejection tests for the evidence parser.

Measured on OpenCode 2.0.22: both member runs fail before any tool call
with `provider.auth`, HTTP 403. The free provider rejects private-instance
execution. The default no-model attachment probe still reports PARTIAL.
Config fingerprints cover the home `.config/opencode`, repository root,
and fixture root `opencode.json`/`opencode.jsonc` files; they do not prove
that every possible configuration source is isolated or unchanged.

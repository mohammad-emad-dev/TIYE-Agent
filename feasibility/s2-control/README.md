# TIYE S2 control-channel probes (feasibility slices)

Bounded slice of Feasibility Test Plan S2.1 + Architecture 4.2: attach a
minimal team-tools MCP server to installed OpenCode. The default probe makes
no model request; the separate invocation probe uses the approved free model.

## Permission probes

`npm run probe:approval-outcomes` adds a controlled edit-denial case,
shell rejection, and approval once. Each uses a fresh disposable project.
The final batch passed all three cases, with 44 offline harness checks.
The edit policy allows the tool generally, then denies `protected.txt`;
the classifier requires an actual `edit` call, its exact V2 `path`, a
`permission.rejected` error and unchanged protected bytes.

Approval replies use the own-session API after two observations of the
correlated request. Rejection must leave no completed command or marker.
Approval once must complete the first call and leave a distinct second
request for the same command pending twice; marker bytes must equal
`approved` both before stopping the session and after client cleanup.
No persistent `always` approval is sent. See `approval-outcomes-latest.json`
and the preserved `approval-outcomes-first.json` / `approval-outcomes-second.json`.

OpenCode may finish rejection as an aborted turn without an idle timestamp.
The harness records this separately. Cleanup then requires two own-session
interrupt checks confirming stopped execution, completed assistant turns,
terminal tool states and no remaining permission requests. It does not label
that state normal idle. Prior measurement failures remain recorded.

`npm run probe:permissions` tests an edit-denied session and a shell-approval
session in separate disposable projects through the native terminal. It uses
Muse Spark free `xhigh`, verifies the created session's agent and permission
array, and never replies to approvals or enables automatic approval.

The earlier broad-deny measurement remains **PARTIAL**. Its initial run and a second fresh-session run
both paused the exact shell command for approval without executing it. The
protected file stayed unchanged in both edit cases, but neither produced
an edit tool attempt. That is insufficient evidence of a blocked edit.

Pending approval evidence joins session, assistant-message, tool-call and
exact command identities. The second run requires the same request to remain
pending across two observations. The parent checks file bytes and absence of
the command marker after the owned session and client have stopped. Cleanup,
config fingerprints and the shared service identity are required for a pass.
Forty offline harness checks pass, including rejection of provider/scanner
errors, wrong-session approvals, completed commands, timeouts and file changes.

`evidence/permissions-initial.json` preserves the first measurement;
`evidence/permissions-latest.json` records the repeat and source hashes at its
start. The final extracted pass classifier was checked against the preserved
observations after the live runs. Exit 2 means the combined permission gate
remains incomplete. These checks establish neither OS isolation nor the full
product permission matrix. See `RESULTS.md` for limits and remaining work.

## Briefing retention probe

`npm run probe:briefing` runs three fresh sessions. Each receives a team
briefing as its first typed terminal message, the normal T1 coding task,
then a JSON recall query that contains field names without expected values.
Leader and teammate identifiers differ between trials. All messages use
the same xterm paste/Enter path with accepted-input and stable-idle checks.
Briefing acknowledgment and recall must be text-only; stale assistant IDs,
pre-query messages, user echoes, prose claims, and incorrect profiles fail.

Review captured files under `evidence/briefing` before running
`npm run validate:briefing`. Current result: **3/3 retained the exact profile
after one coding task**, with 33 correctness checks and 37 offline harness
checks passing. The role, leader, and teammate identifiers were not repeated
in T1 or the recall query. Ownership and completion-tool values were
reinforced by T1. These are supplied team metadata, not connected teammates.

This measures short-session retention using first-message briefing delivery.
It does not measure long context, compaction, resume, conflicting instructions,
or enforcement of the role's permissions. See `briefing-latest.json` and
`briefing-validation.json` under `evidence`, plus `RESULTS.md`.

## Instruction, clarification, and nudge probes

`npm run probe:instructions` records a separate batch: three fresh trials
for each of three T1 wordings, one `ask_leader` ambiguity task, and one
controlled task that explicitly withholds its report until reminded.
The function contract, file scope, model, member, and test requirements
stay the same across reporting wordings; the task descriptions are also
phrased slightly differently. No nudge is enabled in the nine comparison
trials. This is a small wording smoke test, not a statistical ranking.

The question case explicitly permits `ask_leader`, denies edits, and
requires its exact question and member acknowledgment. It checks that no
coding tool was called and no task files changed. The fixture acknowledgment
does not answer the question; a real Leader decision and resumed work are
not implemented or tested.

The controlled omission case requires a completed assistant turn and two
successive idle observations before the early reminder path. The original
task must be accepted, files must exist, and no report or provider error
may precede the reminder. Exactly one reminder goes through terminal paste
and Enter; its input and accepted API prompt are checked. The initial
missing report remains recorded. This induced condition does not estimate
spontaneous omission frequency and is kept outside the ten-run cohort.

Review captured files under `evidence/instructions` before running
`npm run validate:instructions`. Current result: all three wordings worked
in 3/3 trials, the question call passed, and one induced omission recovered
after one reminder. The ten captured functions passed 110 correctness
checks; 30 offline harness checks passed. See `instructions-latest.json`
and `instructions-validation.json` under `evidence`, and `RESULTS.md`.
The next S2 checks cover briefing retention, permission behavior, and
approval/error/recovery signals. Full S2 remains open.

## Ten-run reporting measurement

`npm run probe:reliability` runs ten sequential T1 trials with identical
wording, `member-a`, and Muse Spark free `xhigh`. Each trial gets a fresh
Git project, token, and owned service session. It reuses the terminal
delivery and cleanup path above, saves evidence after each trial, and stops
if infrastructure, cleanup, or selected config checks cannot be verified.
Successful reporting leaves correctness validation pending (exit 2).

Captured functions and tests are stored separately under
`evidence/reliability/run-01` through `run-10`. Review these files before
running `npm run validate:reliability`. The validator runs each generated
test file plus independent boundary, fractional, and negative-interval
examples. Missing trials, duplicate indices, skipped/TODO tests, config
drift, changed files, and failed task checks cannot satisfy the gate.
Validation hashes bind the results to the measurement and captured code.

The runner may send one terminal nudge after the 120-second initial window
only if no report was attempted, the task files exist, and the agent is
verified idle after the task. It does not nudge a provider error or a
reported failure, answer approvals, or edit code to obtain a report.
An initial omission remains an omission even if the nudge recovers it.

Current result: **10/10 without help**, with 110 correctness tests and
28 offline harness checks passing. There were zero nudge attempts; recovery
after an omitted report is **unexercised**. These results apply to this
simple T1, exact instruction wording, model/version, and Windows host.
Alternative wording, `ask_leader`, briefing, permissions, and error/recovery
gates remain open. See `evidence/reliability-latest.json`,
`evidence/reliability-validation.json`, and `RESULTS.md`.

## Terminal T1 harness (experimental)

`npm run probe:terminal-task` prepares a disposable Git project, creates a
service session with Muse Spark free `xhigh`, and waits for its MCP server
to connect. The session uses the `build` agent, permits edits, and requires
approval for shell actions. No automatic approval or shell response is sent.
These permissions do not provide an OS boundary for edits.

The harness reuses S1's installed Electron, xterm.js, node-pty, esbuild,
and Windows Job controller. Install and rebuild the S1 dependencies first.
It assigns Electron to the Job before spawning the native OpenCode TUI,
then sends the task through xterm bracketed paste and an Enter key event.
It requires an accepted user message matching the task after trimming only
boundary whitespace, a completed report with the
fixture acknowledgment, member attribution, and verified owned cleanup.
Only the created service session and temporary location are removed.

The task adds `clamp.js` and `clamp.test.js`. If generated, these files are
retained under `evidence/t1-member-a` and `evidence/t1-member-b` for review.
A verified round trip still returns PARTIAL (exit 2): inspect that code, then
run `npm run validate:terminal-task` before claiming T1 success. The validator
runs both generated test files and independent boundary/negative/fractional
examples. It records hashes tying validation to the captured files and the
round-trip evidence. This command
never claims the ten-run S2.2 reliability threshold.

Current live result: **two terminal T1 tasks validated** on OpenCode 2.0.22.
Both members generated the function and tests and called `report_result`
once without a nudge. The parent reviewed the code; all 22 generated and
independent correctness tests passed, together with 21 harness checks.
See `evidence/terminal-task-latest.json`, `evidence/terminal-task-validation.json`,
and `RESULTS.md`. This is not a ten-run reliability measurement.

Startup recovery: Windows reserved the configured port 49374. A loopback
bind check passed for 40900, and `opencode service set port 40900` followed
by `opencode service start` restored the service. This is a persistent local
service setting change. No Windows reservation or unrelated process was
modified. Availability must be checked again if the service fails later.

Input evidence separates xterm's focus reports from task bytes, rejects all
other extra input, and checks the accepted API prompt independently. Cleanup
stops the owned model session first, closes the TUI Job, then evicts the
owned location so the TUI cannot reload it.

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
cannot pass. The acknowledgment matcher has now been checked against real
successful service-backed CLI calls; the standalone configuration still fails.

The model phase has a 120-second deadline after setup. The private CLI
tree is terminated by releasing its owned Job Object, including on a
timeout; there is no service-owned background session to interrupt.
Only the exact created temporary project is removed. No global service
is stopped. Redacted results go to `evidence/tool-call-latest.json`.
Exit `0` means this invocation slice passed; `1` means it failed.
`rtk npm run check` runs offline rejection tests for the evidence parser.

Measured on OpenCode 2.0.22: both standalone member runs fail before any tool
call with `provider.auth`, HTTP 403, under the deny-all tool configuration.
The service-backed slice below shows that the earlier attribution to
private-instance execution was too broad. The default no-model attachment
probe still reports PARTIAL.
Config fingerprints cover the home `.config/opencode`, repository root,
and fixture root `opencode.json`/`opencode.jsonc` files; they do not prove
that every possible configuration source is isolated or unchanged.

## Service-backed model invocation

```bat
cd feasibility\s2-control
rtk npm run probe:service-tool-call
```

This adds a fresh owned session in each disposable member project through
the shared OpenCode service. The native CLI resumes that exact session
with the approved Muse free `xhigh` model and `plan` agent. Both the child
working directory and `PWD` point to the project. The probe waits for its
MCP server to report connected before submitting the prompt.

The service configuration denies edits, sets shell access to `ask`, and
allows the report tool. It does not pass `--auto` or answer approvals.
Other default plan tools can remain visible. A passing invocation must
use only the report tool. This profile is not proof of the product's
terminal-off or full read-only permission guarantees.

In addition to the server match and structured acknowledgment, the probe
verifies the model on actual assistant messages. Cleanup interrupts only
the created session, checks an idle timestamp, deletes and checks absence
of that session, evicts only the owned location, and verifies its absence.
The model CLI client has its own Job Object; the shared service is not
assigned to it. The service PID and version must remain unchanged.
If session or location cleanup cannot be verified, the temporary project
is retained and the run fails. No broad location reload is issued.
This controlled teardown does not establish recovery after an orchestrator crash.

Evidence is written to `evidence/service-tool-call-latest.json`. The model
phase has a 120-second deadline; API calls each have a 12-second bound,
and catalog polling permits at most twelve calls. Setup and cleanup are
additional time. The measured result passes for both members. It proves
the native CLI invocation slice, not ten-run S2.2 reliability or terminal
delivery of T1.

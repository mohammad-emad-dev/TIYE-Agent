# S2.1 result — OpenCode MCP attachment without a model request (feasibility slice)

## S2.3 first-message briefing retention (13 October 2026)

**PASS for this short-session probe; full S2 remains open.** Three fresh
OpenCode 2.0.22 sessions with Muse Spark free `xhigh` received a briefing
through the native Electron/xterm/node-pty terminal as their first user
message. Each completed T1, reported once, and recalled its exact assigned
profile in a later JSON-only reply.

| Check | Observed |
|---|---|
| First-message briefing accepted, then idle without tools | 3/3 |
| Later T1 report and assigned-file scope | 3/3 |
| Recall of self, role, leader, teammates, owned files, completion tool | 3/3 exact matches |
| Recall input accepted; post-query reply completed without tools | 3/3 |
| Generated test cases | 9 passed |
| Independent correctness cases | 24 passed |
| Offline harness checks | 37 passed |

Leader/teammate identifiers differed between trials. Their values and the
worker role were delivered only in the initial briefing, not the coding
task or recall question. The task reinforced ownership and completion-tool
values; the fixture acknowledgment also named the current member. Thus
those fields do not independently prove unrepeated memory. The profiles
describe test metadata, not a running multi-member team.

Before recall, the harness verified the coding turn was idle and recorded
all existing assistant IDs. It checked only later assistant replies after
the accepted recall message, with two idle observations and a completed
turn. User echoes and older replies could not satisfy the check. Exact JSON
field/value matching rejected generic claims, wrong-trial identities,
missing or extra fields, and unfinished replies. Raw briefing/recall reply
text, credentials, and session IDs are not persisted in the evidence.

- [Phase and cleanup evidence](evidence/briefing-latest.json)
- [Independent code validation](evidence/briefing-validation.json)
- Registered profiles and prompts: `scripts/briefing-cases.js`
- Reviewed generated code: `evidence/briefing`

The parent reviewed all three functions and test files before the 33
correctness checks. Model identity, input, report acknowledgment, member,
file scope, log hygiene, owned session/client/location cleanup, fixture
shutdown, temporary removal, and unchanged selected configs/service
identity passed. Service 40900 stayed running; prior evidence was preserved.

Muse free `xhigh` completed its supplied-facts read-only design review.
Both MiMo Atria and Claude Atria `xhigh` timed out after four minutes without
final reviews. Claude's tripwire saw the parent's concurrent edits, which
were reviewed directly. No model was substituted.

Limits: one compatible coding task and short context per session. No
compaction, long-session retention, resume, conflicting role instruction,
permission enforcement, or actual team coordination is proven. First
terminal message is the tested delivery method; persistent config/launch
role mechanisms are not assessed here. Next: S2.4 permission behavior and
S2.5 approval, error, and recovery signals.

## S2.2 wordings, ask-leader, and induced omission (13 October 2026)

**PASS for these bounded probes; full S2 remains open.** This batch is
separate from the earlier ten-run reliability cohort and preserves its
evidence. All runs used fresh projects, tokens, and sessions with OpenCode
2.0.22, Muse Spark free `xhigh`, and `member-a` through the real terminal.

| Case | Observed |
|---|---|
| Wording A, original instruction | 3/3 unassisted reports |
| Wording B, completion protocol | 3/3 unassisted reports |
| Wording C, deliverable instruction | 3/3 unassisted reports |
| `ask_leader` ambiguity task | One exact question, correct acknowledgment, no report or coding call, no task-file changes |
| Induced omission | No initial report, verified idle; one accepted terminal reminder recovered one correct report |
| Correctness after code review | 30 generated and 80 independent cases passed |
| Offline harness checks | 30 passed |

The three wordings are tied in this three-trial-per-wording sample. They
preserve the same function contract, tests, and file/command constraints,
with slight phrasing changes in the task description as well as the
reporting instruction. No causal or statistical superiority is claimed.
The earlier ten-run wording remains the established baseline.

The question asked how `clamp` should behave when min exceeds max. The
model called `ask_leader` with the prescribed text and correct member.
The SDK server independently recorded its argument match. The prompt
explicitly distinguishes the fixture acknowledgment from a real decision.
The harness stopped the owned session after the call; a real Leader answer,
continued waiting, and resumed implementation remain untested.

In the induced-omission control, the prompt required completing the files
but withholding a report until reminded. The model ended its turn and
two successive session checks showed idle after task submission, without
an attempted report. Initial reporting remained false. One reminder was
delivered through xterm paste/Enter and matched in the accepted API user
message. Exactly one `report_result` then reached the fixture with the
expected summary/status and acknowledgment. Initial observation took
12.530 seconds; the whole report/reminder observation took 21.971 seconds
after submitted-input confirmation. This proves one controlled recovery,
not recovery rates for natural omissions or crashes.

- [Per-case measurement](evidence/instructions-latest.json)
- [Correctness and outcome validation](evidence/instructions-validation.json)
- Exact prompts: `scripts/instruction-cases.js`
- Captured code: `evidence/instructions`

The parent reviewed all ten generated functions and test files before
executing the 110 correctness checks. Validation hashes bind the files,
independent checker, and source evidence. Every case verified model,
member, input, exact tool arguments and acknowledgment, file scope,
fixture/log hygiene, and owned cleanup. Selected configs and service
identity remained unchanged; no T1 temporary project remained. Service
40900 was not changed or restarted. Older evidence and LinkedIn assets
were preserved.

Muse free `xhigh` completed the supplied-facts read-only review; its state
comparison included the pre-existing `output/` assets only. Both MiMo
Atria and Claude Atria `xhigh` timed out after four minutes without final
reviews. Claude's tripwire recorded the parent's concurrent edits, which
were inspected directly. No model was substituted.

Next: S2.3 briefing retention, S2.4 permission behavior, and S2.5 approval,
error, and recovery signals. S1 display parity and other feasibility gates
also remain open before building the core event store and team engine.

## S2.2 ten-run identical-wording measurement (13 October 2026)

**PASS for this reporting measurement; full S2 remains open.** All ten
fresh terminal T1 trials reported correctly without assistance through
OpenCode 2.0.22 with `opencode/muse-spark-1.3-contributor-free#xhigh`.
The caller was `member-a` in every trial; projects, tokens, and sessions
were recreated for each. The wording was unchanged from the earlier T1
slice, including the prescribed result summary. No direct SDK tool-call
or parent-side implementation substituted for the terminal task.

| Measurement | Observed |
|---|---|
| Initial reports | 10/10 (threshold: at least 9/10) |
| Reports within a budget of one nudge per task | 10/10; zero nudges used |
| Actual nudge recovery | Unexercised |
| Generated test cases | 30 passed |
| Independent correctness cases | 80 passed |
| Offline harness checks | 28 passed |
| Initial report time, measured after submitted-input confirmation | 7.542–23.280 seconds; median 10.626 seconds |

The parent reviewed all ten captured functions and test files before
executing them. Each run passed its three generated tests and eight
independent boundary, fractional, and negative-interval examples. No
skipped or TODO tests were accepted. Validation fingerprints bind the
captured code, independent checker, and measurement evidence to these
results. No failed trial was replaced or removed from the denominator.

- [Per-trial measurement](evidence/reliability-latest.json)
- [Correctness validation](evidence/reliability-validation.json)
- Captured code: `evidence/reliability/run-01` through `run-10`

Every trial verified terminal input, accepted prompt, exact acknowledgment,
model selection and executed model, member attribution, task-file scope,
fixture/log checks, and controlled owned cleanup. Selected configs and
service identity remained unchanged. No temporary T1 project remained.
The service stayed on 40900. The earlier two-task evidence was preserved.

The conditional one-nudge path is implemented but was not exercised by
this cohort: each initial report arrived successfully. It requires an
accepted task, no attempted report, no provider error, existing task files,
and idle state after task delivery. Any nudge uses the same terminal path,
and an initial miss stays a miss. This is not evidence of successful
recovery from an actual omitted report.

Delegation: Muse free `xhigh` completed the supplied-facts read-only review.
Its before/after state included only the pre-existing LinkedIn `output/`
assets. Both MiMo Atria and Claude Atria `xhigh` timed out after four
minutes with no final review. Claude's change tripwire reflects the
parent's concurrent implementation edits, which were reviewed directly.
No model was substituted.

Limit: a ten-trial cohort on one small task, one wording, one member/model,
and one host does not establish general production reliability. Next:
compare three instruction wordings, test `ask_leader`, and exercise nudge
recovery separately before completing the remaining S2 gates.

## Terminal T1 validation and startup recovery (13 October 2026)

**PASS for this two-task slice.** Both members completed T1 through the
native OpenCode TUI in Electron/xterm/node-pty with the approved Muse Spark
free `xhigh` model. Each created `clamp.js` and three `node:test` cases,
reported once with the correct member and summary, and needed no nudge.
The parent reviewed both generated functions and test files. The six
generated tests plus sixteen independent boundary, fractional, and negative
interval examples passed (22 total). Hashes bind the validation to its
source evidence and captured files.

- [Terminal round-trip evidence](evidence/terminal-task-latest.json)
- [Independent correctness validation](evidence/terminal-task-validation.json)
- [Service startup recovery evidence](evidence/service-startup-latest.json)

The startup blocker was a reserved port: the local log reported managed
port 49374 unavailable; Windows listed exclusion range 49361–49460.
A same-user loopback bind check passed on 40900. The documented
`opencode service set port 40900` and `opencode service start` commands
restored service availability; `service get port` returned 40900.
This changes the persistent local service port. No Windows reservation,
authentication configuration, or unrelated process was modified. This
matches the failure described in the
[upstream Windows startup report](https://github.com/anomalyco/opencode/issues/41746).

Two harness corrections were needed before validation: xterm emitted two
focus reports around input, and the TUI stored one additional boundary
whitespace character in the user message. Focus replies are classified
separately; other extra bytes, duplicate paste, and missing Enter fail.
Prompt comparison trims boundary whitespace only and preserves every
internal character. Actual accepted prompt and model identity checks passed.

The first live attempt also showed that evicting a location while its TUI
was open allowed it to remain loaded. Cleanup now interrupts and verifies
idle for the owned session, removes the session, closes the client Job,
then evicts the owned location. Both final runs verified six captured
process identities gone, location/session removal, fixture shutdown,
temporary project removal, log hygiene, unchanged selected configs, and
unchanged shared service PID/version. The two retained projects from the
failed cleanup attempt were subsequently evicted from their own working
directories and removed after confirming their session lists were empty.

Verification: 21 offline harness checks and 22 task correctness tests pass.
Muse free `xhigh` completed its supplied-facts review without edits.
Both MiMo Atria and Claude Atria `xhigh` reviews timed out after four
minutes; neither supplied a final review. Claude's change tripwire reflects
the parent's concurrent implementation edits. No model was substituted.

The ten-run S2.2 threshold, alternative wordings, one-nudge behavior, and
`ask_leader` task remain unmeasured. Full S2 and S1 stay open. Next: begin
the controlled repeated task/report measurements.

## Terminal T1 attempt (13 October 2026, later run)

**BLOCKED before session creation.** Both member attempts failed while
requesting service information. `opencode service status` returned `stopped`;
the native API command and a separate `opencode service start` attempt
returned “Timed out waiting for the background service to start.” No
terminal was launched for T1, no prompt was submitted, and no result tool
was called. This does not measure reporting reliability or reverse the
earlier successful marker invocation.

Added an opt-in terminal harness and disposable T1 Git fixture. Its
completion detector requires actual accepted user input and a completed,
member-matching tool acknowledgment. A round trip alone remains PARTIAL
until the retained generated code receives independent review and tests.
The shared service is not restarted or globally reloaded. The attempted
start did not establish a running service. All command wrappers finished.

The failed initial attempts retained their temporary projects; both exact
paths were inspected and removed after confirming failure occurred before
session creation. The runner now removes its project on that specific
pre-session failure path. Uncertain session-creation failures still retain
the project for recovery. The latest attempt records cleanup separately.
See [`terminal-task-latest.json`](evidence/terminal-task-latest.json).

Verification: 14 offline rejection tests, all S2 JavaScript syntax checks,
the xterm renderer bundle, and Electron loading the rebuilt node-pty module
passed. These checks do not prove live terminal input or task correctness.

Delegation: Claude `Atria-Dawn-Preview` `xhigh` completed a read-only design
review. Its change tripwire saw the parent's concurrent edits; no delegate
editing tool was available. MiMo `atria/Atria-Dawn-Preview` timed out after
four minutes. Muse free `xhigh` delegation failed during service startup
and supplied no review. No model substitution occurred.

Next: restore a working OpenCode service, run terminal T1, inspect and test
the generated function, then begin the ten-run reporting/nudge measurements.

## Service-backed invocation slice (13 October 2026)

**PASS for this invocation slice:** both members called `report_result`
exactly once through native OpenCode 2.0.22 using
`opencode/muse-spark-1.3-contributor-free#xhigh`. Each call had the correct
member, exact unique summary marker, and `done` status. The server recorded
the match; the CLI emitted a completed tool event with the exact fixture
acknowledgment. There were no other observed tool calls. Actual assistant
message models also matched the approved provider, model, and variant.
See [`service-tool-call-latest.json`](evidence/service-tool-call-latest.json).

The earlier private-instance explanation was too broad. Service-backed
requests also returned 403 with shell denied. Changing the probe to the
`plan` agent with edits denied and shell approval required allowed model
execution. This agrees with an
[upstream reproduction of the shell-denial/free-tier interaction](https://github.com/anomalyco/opencode/issues/50627).
No credentials, client-identification headers, or provider checks were
changed. The private path has not been retested under this profile.

An initial model request sent before catalog readiness completed without
calling the tool. Waiting for the owned project's `/api/mcp` connected
status before prompt delivery produced real calls for both members.
The successful event shape also validates the existing acknowledgment
matcher against real CLI output.

Cleanup passed: only the created session was interrupted, its idle state
was checked, deletion was verified in the session listing, and only its
temporary location was evicted and checked absent. Client Job Object
assignment and process cleanup, fixture shutdown, exact temporary path
removal, selected config fingerprints, and log hygiene passed. Shared
service PID/version were unchanged. Tokens, session IDs, arguments,
provider bodies, and model text are not persisted in the evidence.

The final profile exposes some default plan tools and requires approval
for shell actions. No shell action or automatic approval occurred. This
is not proof that shell-off works with the free model, or that production
role/file permissions are enforced. The exact full CLI tool catalog,
terminal-delivered T1, ten-run S2.2 reliability, and ask-leader behavior
remain separate gates.

Delegation: Muse free `xhigh` and Claude `Atria-Dawn-Preview` `xhigh`
completed read-only reviews; MiMo `atria/Atria-Dawn-Preview` timed out
after four minutes. Claude's tripwire recorded the orchestrator's
concurrent implementation edits, which were inspected independently.
Offline rejection tests and syntax/diff checks pass.

Next: deliver a real T1 task through the terminal, then run the repeated
reporting and nudge measurements specified in S2.2.

## Model invocation slice (13 October 2026)

The new opt-in `npm run probe:tool-call` is implemented, but the actual
tool invocation gate **fails** with the approved free Muse model.
OpenCode 2.0.22 returned `provider.auth`, HTTP 403, for both members before
any tool call. Its diagnostic message was: “OpenCode's free tier can only
be used from within OpenCode.” Direct API prompt delivery, native
`run --server` against the private instance, and native `run --standalone`
all encountered that restriction. The committed runner uses the last,
simplest native path; it does not change credentials or bypass the check.

[`evidence/tool-call-latest.json`](evidence/tool-call-latest.json) records
zero server reports and no CLI acknowledgment for each member. The native
process was assigned to the S1 kill-on-close Job Object before prompt
delivery. Each run captured four process identities before submission;
cleanup, selected config fingerprints, fixture shutdown, exact temporary
directory removal, and log hygiene passed. Startup/provider bodies,
bearer tokens, summary markers, and session IDs are not persisted.

The runner requires both a matching server call and a structured CLI
acknowledgment for a future pass. The positive acknowledgment matcher is
still unverified against a real successful tool call. Local negative
checks reject prose-only output, malformed events, wrong marker, wrong
status, wrong tool, and duplicate completed reports. These checks do not
prove model reliability or production permissions.

The default no-model probe was rerun: private MCP attachment, direct SDK
tools and acknowledgments, auth/session checks, and cleanup still pass;
the overall result remains PARTIAL because exact CLI tool exposure is
unproven. Syntax and diff checks pass.

Requested delegation: Muse Spark free `xhigh` completed its read-only
evidence review through the existing OpenCode service. MiMo
`atria/Atria-Dawn-Preview` and Claude `Atria-Dawn-Preview` `xhigh` each
timed out after four minutes without a review. Claude's read-only
tripwire observed the orchestrator's concurrent implementation edits;
those files were independently inspected. No Atria review is claimed.

Next: test a supported service-backed invocation path with interruption
of only the owned session and disposable member configuration. The
contrast with the successful Muse review suggests a private-instance
restriction; its precise cause is not established. S2.2 terminal delivery,
ten-run reliability, role permissions, and the core team engine remain open.

## Persistent private CLI slice (12 October 2026)

Verdict remains **PARTIAL**, with private CLI server attachment now proven
for both members. `scripts/persistent-cli.js` launches the installed native
OpenCode 2.0.22 executable beside its npm shim with `serve --stdio`, loopback
hostname, and port zero. It keeps stdin open, assigns the process to the
existing S1 kill-on-close Job Object controller, then polls `/api/mcp` at
most eight times. Startup output and its generated API password stay in
memory; only fixed status fields and timings enter the evidence.

Two independent complete probe runs observed `absent` → `pending` →
`connected` for each member. Each private instance opened one MCP session
and requested `tools/list`. Closing stdin and the controller released the
owned processes; Job Object read-back and exact captured PID/creation
identity checks passed for both. The fixture server then stopped and its
owned temporary directories were removed. Auth, session ownership, direct
SDK tools/acknowledgments, config snapshots, and log hygiene still pass.

This supports a startup/lifetime explanation for the empty single-shot
API listing; the exact internal cause is not established. The same
persistent API instance reports different states as it remains alive.
The [`/api/mcp` response schema](https://opencode.ai/v2/docs/api) returns
server names and status, without a tool-name catalog. Therefore connected
status and a received `tools/list` request cannot satisfy the exact-tools
gate. `cli.persistentDiscoversServer=true` records this narrower result;
`cli.discoversServer` still describes the original default CLI listing.

The persistent fixture currently requires Windows and the installed npm
shim/native-executable layout. Job assignment occurs after native launch
and before API polling. It reuses the S1 controller without modifying S1.
The eight-request bound includes up to four seconds per API request; it
is not an overall eight-second timeout. A private startup, API, inventory,
containment, or cleanup error produces a failure rather than a pass.

All three requested delegates completed read-only diagnoses with no file
changes: MiMo `atria/Atria-Dawn-Preview`, OpenCode
`opencode/muse-spark-1.3-contributor-free` with `xhigh`, and Claude
`Atria-Dawn-Preview` with `xhigh`. The orchestrator implemented and ran
the fixture independently. Syntax checks and the S1 typecheck/build pass.

Next: prove tool availability through an actual CLI tool invocation with
the approved free model, then begin S2.2 reliability measurements. No
model request or task round trip was made by this fixture.

## Prior diagnostic slice (12 October 2026)

This section records the preceding committed slice at `66cba44`.

Verdict remains **PARTIAL**. The current runner uses canonical V2
`mcp.servers.<name>` with `disabled: false`, checks `mcp list` from each
temporary member project, and observes only fixed protocol method names.
The SDK's transport callback chaining was checked in the installed SDK.
No payload, token, session ID, or argument name is logged by this observer.

Independent runs still returned an empty standalone API server list and
`No MCP servers configured` from both project listings. The fixture did
observe CLI `tools/list` requests before the SDK client proof. This
distinguishes catalog requests from merely completing `initialize`; it
does not prove that OpenCode retained the catalog or exposed tools to a
model. The earlier hypothesis that OpenCode never lists tools is therefore
unsupported. The cause of the empty API result remains unknown.

See `evidence/latest.json` `cli.beforeSdk` for aggregate counts before the
SDK client starts. Per-phase counts are observation windows; delayed CLI
activity can cross a boundary. Direct SDK tool listing, acknowledgments,
auth rejection, session ownership, loopback binding, config snapshots,
and controlled fixture teardown still pass. Syntax checks and the S1
typecheck/build pass. S2.2 remains unattempted.

Delegation outcome: both Atria reviews timed out. Muse was interrupted
after an out-of-scope cleanup of temporary `tiye-*` paths, including older
diagnostic folders. Committed project files were intact. Its incomplete
private-server implementation was discarded. The orchestrator implemented
and verified the smaller diagnostic changes recorded here.
Stopping the CLI wrapper did not stop service-owned session execution.
The orchestrator used the session interrupt API; it first reported
`interrupted=true`, then `interrupted=false` on a second call. A process
inventory subsequently showed only the pre-existing OpenCode service,
with no fixture or private OpenCode process remaining. Future delegation
must stop the service-owned session as well as its CLI wrapper.

The next experiment should keep an owned private OpenCode server alive
and poll its catalog state, with verified process-tree teardown. A single
connected status is insufficient to close S2.1; exact tool exposure must
still be proven. That prior fixture added no such server lifecycle.

## Prior baseline (historical)

The remaining sections describe the preceding committed slice at
`efdf070`; method details and phase counts below are historical.

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

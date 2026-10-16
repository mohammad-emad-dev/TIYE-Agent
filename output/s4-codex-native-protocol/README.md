# Linux Codex qualification protocol — prepared 16 October 2026

**Preparation only. No native process, login or inference was run for this task.**
This refines the [conditional outline](../s4-codex-transport-assessment/NEXT-RUN.md)
into bounded experiments. [OpenAI received the inquiry](../s4-codex-outreach/README.md);
its response and TIYE's route eligibility remain pending. Phase 1 stays **HOLD**.

## Fixed target and admission

Use Ubuntu, non-root UID 1000, and the installed Linux Codex **0.157.1** candidate.
Read the exact executable path from the frozen
[installation record](../s4-codex-candidate/installation.json), not PATH lookup.
Its expected executable SHA-256 is
`3e2584f3f3829a43a0495011a1cecb2facbe64a2403e2b682351fd9c2983f970`.
Hash it again before and after each cohort. Any mismatch stops admission; updating
the binary needs a separate baseline and version-specific protocol review.

Before execution, freeze a new source/input manifest and a distinct exclusive
output directory. Refuse an existing directory. Record exact Windows and Ubuntu
versions, UID, executable identity, argv, allowed environment key names, working
root and all deadlines. Do not copy the user's existing CLI configuration,
credentials, plugins or MCP settings into the experiment.

For U0, construct the Linux child's environment from an empty mapping: allow only
`PATH=/usr/bin:/bin`, `LC_ALL=C.UTF-8`, and HOME, CODEX_HOME, TMPDIR pointing to
fresh directories below its marker-owned runtime root. Do not merge inherited
variables or import WSLENV values. The Windows launcher must also use a reviewed
minimal environment without credential variables or WSLENV propagation. Freeze
the non-secret resulting values and sizes, UID/GID/groups and umask. This limits
environment-based credential discovery; it does not by itself isolate other
readable host files, keyrings or network access. Admission must review those
paths before labeling a run unauthenticated. Runtime roots and host capture
directories are distinct; record their mapping, ownership and access permissions.

The first candidate control surface is local app-server JSONL over stdio. The
saved 0.157.1 help declares `app-server --listen stdio://`; this selects a
**qualification candidate**, not TIYE's production adapter or an approved auth
route. Provider guidance may require a different supported integration. In that
case prepare a new protocol before launch; do not silently reinterpret this one.

| Prerequisite | Required evidence before the dependent experiment |
| --- | --- |
| Product route | Substantive provider guidance establishing the applicable paid local scope and any required onboarding; a form receipt is insufficient |
| Auth mechanism | Documented route-specific login/consent and credential storage ownership; no cached-token transfer or internal-use token login variant |
| Account/model | Existing private account declaration plus a user-controlled login and exact requested `gpt-6-luna` / `max` applicability check; no fallback without recording a new candidate |
| Runtime containment | Reviewed launcher, process ownership/recovery implementation and independent identity checks, with network and filesystem boundaries actually enforced or explicitly unresolved |
| Capture privacy | Reviewed field-level redaction before public output; private raw captures remain outside Git until inspected |
| Post-U0 wire contracts | Freeze the selected version's exact auth, thread/turn, model/effort, callback/decline and interrupt request/response contracts before their respective cases; the U0 packets below do not define these later cases |

Unauthenticated local inspection and harness implementation can proceed before
the provider response. Launching the candidate still requires its executable,
environment, capture and cleanup prerequisites. Authenticated experiments require
all applicable route/account prerequisites. U0 is transport-only and does not
require product route eligibility; it establishes no product permission. A0,
T0, P0, P1 and F0 require it; C0 inherits the route requirement of the session
being measured. This document is not a launcher.

## Experiment bounds

These are proposed **test limits**, not vendor performance guarantees. Freeze
them in each cohort's input manifest; a changed limit requires a new cohort.

| Boundary | Limit / action |
| --- | --- |
| Host-to-WSL startup | 30 s wall deadline; failure retains launcher identity and diagnostics for recovery |
| Linux child startup and initialize | 15 s each; overall unauthenticated cohort 90 s, including cleanup and up to 15 s verification |
| User-controlled login | Separate interactive phase, 10 min work ceiling plus 15 s cleanup, 615 s overall; cancellable by user; no unattended polling past deadline |
| Harmless inference turn | One submitted turn, 120 s; 210 s overall including startup, initialize, up to 15 s verification and cleanup, after login |
| Approval/error cases | One owned turn per case, 120 s; each case has its own 210 s overall deadline |
| Input | At most 16 KiB per JSONL record including LF, one serialized writer, one planned request at a time |
| Output | 256 KiB maximum JSONL record excluding LF; 4 MiB retained stdout and 1 MiB retained stderr per cohort |
| EOF or invalid input/output | Revoke pending local reply plans, stop dependent requests, record partial outcome and begin cleanup |
| Limit reached | Stop capture admission, preserve observed prefix and overflow reason, begin cleanup; retained bytes do not imply a bound on process memory |
| Cleanup reserve | Inside the cohort deadline reserve 15 s: close stdin, wait up to 5 s, identity-bound TERM and wait up to 5 s, identity-bound KILL and verify up to 5 s |

Always read stdout and stderr concurrently with process monitoring. Start the
host deadline before WSL launch. Phase caps are maxima inside the overall cap,
never an extension of it. Bound launcher/child creation as well as their waits.
Count line bytes incrementally with fixed-size reads, before retaining another
chunk; never wait for an unbounded line. At an output cap, continue draining and
discarding with fixed-size buffers during bounded cleanup, recording discard
counts; do not wait for a blocked child to produce more output. If reader failure
prevents draining, abort the owned pipes and escalate immediately. At the final
deadline, close local endpoints and record any unsettled task as unverified.
Once a failure or cancellation starts cleanup,
do not spend the remaining work budget waiting for more protocol progress.
If the launcher outlives the host deadline or Linux ownership cannot be recovered,
record cleanup **unverified** and block another launch; do not kill arbitrary PIDs
or terminate the user's entire Ubuntu distribution. An extra bounded recovery
attempt needs a separate record rather than an unrecorded extension of the run.

## Staged cases and witnesses

| Case | Operation and independent witness | Stop / acceptance boundary |
| --- | --- | --- |
| U0: no-auth transport | Fresh isolated HOME, CODEX_HOME, TMPDIR and cwd; fixed argv; initialize request and matching response; initialized notification only after success; close stdin and observe whether it exits | No account, model, thread or turn requests. Stdin EOF is an observation, not a verified graceful-shutdown contract. Report handshake, natural exit and escalated cleanup separately. No claim of network silence without network enforcement/measurement |
| A0: authentication | Separately qualified official user-controlled flow, private credential storage and sanitized account/auth result | No credentials in CLI arguments, briefs, screenshots or public streams. Stop on unsupported route or unconfirmed consent; a token or plan label is not model access |
| T0: bounded task | New Linux-owned disposable Git worktree; ask for one marker file with an exact public nonce, no external commands/network; independently inspect exact bytes, Git diff and unexpected changes | One turn only. Protocol completion, marker outcome and cleanup each get separate results. The prompt does not enforce tool/network isolation; only proceed when controls satisfy the admitted boundary |
| P0: denial | Separate owned case requests a harmless file change outside the permitted effect set but inside the disposable root; correlate the native approval if emitted; send one explicit decline; compare baseline and filesystem witness | No approval emitted means this approval case is inconclusive. No wider session, network or execution-policy grant. A refusal/error alone does not prove callback behavior |
| P1: cancellation | Separate owned case with a pending native callback; cancel the turn through the supported control surface; then exercise local late-reply refusal | Preserve native events separately from client refusal. Local refusal does not establish that the native server would reject the reply |
| F0: interruption/loss | Separate cases for deliberate interruption and owned transport loss; preserve partial file state and server/process identities | Stop on uncertain outcome; no automatic resubmit, reconnect, resume or approval reuse. Deliberate fault is not a natural outage |
| C0: normal/abnormal cleanup | Observe normal quit in one cohort; intentional owner exit in another; recover only identities recorded by the launcher | Match Linux boot ID, PID start time and ownership; inspect descendants and independently verify absence. Direct-child exit alone cannot pass tree cleanup |

For T0, explicitly set the exact requested model and effort using the subsequently
frozen native contract. Record what was requested and any native confirmation or
override separately. A successful turn without sufficient configuration evidence
does not qualify `gpt-6-luna` / `max`. No catalog label alone proves access.
T0 and approval cases need an enforced boundary for allowed effects; if the
launcher cannot enforce it, do not run the effectful case under this protocol.
For C0, freeze any supported normal quit operation before launch; absent that,
qualify EOF observation and escalation only. Escalated cleanup does not retroactively
make a successful handshake fail or establish graceful shutdown.

The worktree is created by Linux Git under the fresh experiment root. Record
resolved paths, baseline commit/tree/content hashes and an owner nonce. Use one
Git execution side for the project and all linked worktrees. Refuse symlinks or
resolved targets escaping the root. Do not use the real project as a model's
write target. Retain fixtures after a run; recursive deletion is not part of
qualification.

Define the baseline commit as the commit created in the fresh synthetic Linux
fixture before any agent work; record its SHA and clean status. Resolve and check
targets before every effect and inspect them again afterward. Path checks alone
do not prevent an adversarial symlink race; enforce filesystem isolation for
effectful cases and report its actual limits.

## Exact U0 wire contract

Pinned declarations are in `v1/InitializeParams.json` and
`v1/InitializeResponse.json` inside the [saved schema archive](../s4-codex-schema/schemas.zip).
Encode these packets as strict UTF-8 JSON plus a single LF:

```json
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"tiye_feasibility","title":"TIYE feasibility","version":"0.0.1"},"capabilities":{"experimentalApi":false}}}
{"method":"initialized"}
```

Send the second packet only after a matching successful response to ID 1. Require
the declared response fields `codexHome`, `platformFamily`, `platformOs` and
`userAgent`; confirm the returned home matches the new isolated CODEX_HOME and
the platform identifies Linux. Preserve errors and unexpected packets rather
than interpreting them as success. Stop on duplicate/conflicting responses,
malformed framing, EOF before the response or budget exhaustion. Do not send a
model request to make initialize succeed.

The source declarations do not prove runtime behavior or current production
support. Preserve the earlier helper-alias warning if it occurs; do not suppress
it or infer helper availability from a successful handshake.

## Required result record

Keep route eligibility, native access, handshake, protocol completion, intended
file effect, unexpected effects, approval observation and tree cleanup as separate
pass/partial/fail/not-run values with supporting artifact paths and hashes.
Record all writes as planned/attempted/drained/peer-observed as applicable. An
interrupted write remains uncertain even if the process later exits. Save
timestamps, correlation IDs, truncation/overflow flags, exit code, identity checks
and recovery actions. Record which boundaries were enforced and which were only
requested or observed.

No secrets or private account fields enter public artifacts. A reviewer must
inspect and sanitize evidence before committing it; hash private raw evidence
only in a private manifest. If unexpected sensitive output prevents safe public
capture, retain it privately and publish a limited outcome instead. A published
sanitized transcript is a derivative, not the original raw stream.

This task produces a protocol, not native evidence. The remaining S1–S6 gates
continue to be tracked in the [readiness assessment](../s4-codex-transport-assessment/README.md).
Delegated supplied-context reviews and parent dispositions are in `review.json`.

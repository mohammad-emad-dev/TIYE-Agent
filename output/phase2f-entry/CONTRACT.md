# Phase 2F: owned mock-worker execution and conservative supervision

Proposal only. Baselineb53dcb3: accepted schema7 handoff core,181 passing tests.
Target: Architecture Phase2 team engine with a mock worker, before adapters or UI.

## 1 Composition and limits

Add a private internal harness under `packages/mock-team/`, separate from core
production source. Use pinned Windows x64 Node26.7.0 ABI147 and the already pinned
core/native dependencies; introduce no dependency install, provider package or
unreviewed executable fallback. Core import-boundary restrictions stay intact:
the core must not import child_process or learn how to launch a worker.

The test coordinator owns one TaskStore schema7 connection, private disposable core
root, and separate private witness root per task. At most one immutable session,
one or two roster members, maxConcurrent<=2 and six lifetime assignments, counting
handoff successors, per scenario. Retain existing core10 handoff/100 assignment/
1000-event rules; narrower harness limits do not expand core limits. Bound scenarios
are fixed in reviewed source, not loaded from user/project config or model output.

The controller may spawn only `process.execPath` with the single reviewed worker
script at a fixed repository-relative path. Existing fixed independent witness
create/observe helper remains available to the trusted coordinator. No shell,
arbitrary script/module/path, command interpolation, network, provider, terminal or
real project action. Worker source imports no process-launch API and spawns no
descendants. This fixed-code property is reviewed/tested, not an OS sandbox claim.
Worker launch arguments may name only its coordinator-allocated private witness
root/target and a closed trusted fixture mode. They never come from member wire data.

Construct a reviewed allowlisted public environment rather than inheriting API
keys, tokens or account configuration. Pin cwd to an owned fixture directory and
hide Windows child windows. Review/hash exact dependencies and worker/controller/
observer/test files before first execution. Use the same private-root/ancestor/
single-link checks and independent witness schema/action as the accepted core tests.
No schema change, migration, reset, automatic repair or source provenance shortcut.

## 2 Role, approval and scheduling

The controller retains the raw store and binds owner, immutable Leader, scheduler
and member handles in trusted coordinator code. A worker cannot select a session,
member, actor, privileged handle or executable. This is a fixed synthetic composition,
not authenticated transport against hostile code sharing the process/user account.

Scheduler preparation may attach only a fixed scenario plan to the eligible FIFO
head through the existing start command. It must respect member/global occupancy,
including waiting approval, blocked and uncertain assignments. It must pause at
waiting_approval and return control for the fixture to explicitly call the existing
approve API. The controller does not create approvals, override binding/expiry or
interpret title/payload text as permission. No child action begins without a current
approved plan and a successful claim. Unrelated approved work may progress.

The fixture may explicitly ask/answer questions or resolve/hand off failures through
existing core roles between controller runs. The controller does not answer,
abandon, reassign or finish a mission automatically. A bounded run returns when
there are no owned workers and further work needs approval/answer/reconciliation
or explicit scenario preparation; it cannot spin waiting for an owner decision.
All store calls remain synchronous/serialized on the controller's main thread;
workers never receive the core database path or connection.

## 3 Worker protocol and one-time delivery

Use bounded canonical compact UTF-8 JSON-line frames over owned anonymous pipes.
Each frame<=16KiB; total stdout<=64KiB and stderr<=8KiB per worker. Validate bytes,
closed fields, UUIDs, version and text bounds; refuse invalid UTF-8, duplicate
fields, unexpected/truncated/extra frames, unknown states and ID mismatch. Bound
buffering and queued records before allocation growth. Diagnostics are data only.

One worker handles at most ONE invocation and exits. Launch-time trusted context
fixes its witness target/root and fixture mode; no filesystem path is in a wire
frame. Exact frames:

- Worker ready: `{type:"mock.worker.ready",version:1}`. This grants no action.
- Controller invocation: `{type:"mock.worker.invoke",version:1,effectId,attemptId,
  targetId,operation,payloadHash,expiresAt}`. Fields match the existing committed
  core invocation; operation is exactly mock.record. No task/member/process/shell
  fields. Worker independently validates its fixed target, bounds and expiry.
- Worker result: `{type:"mock.worker.result",version:1,effectId,attemptId,status,
  summary}`. Status is exactly done; summary uses existing bounded text grammar.
  This message is a report candidate, never proof of an effect by itself.
- Controller stop: `{type:"mock.worker.stop",version:1}`; optional worker reply
  `{type:"mock.worker.stopped",version:1}`. Stop grants no action/resend.
- Test-only barrier: `{type:"mock.worker.barrier",version:1,phase}`, where phase
  is before_write or after_write. Allowed only in that reviewed fixture mode,
  at most once. It does not constitute a successful effect/result.

The controller may launch a worker and wait for ready before claiming. It MUST
commit the core claim before sending the invocation, send it at most once and
never resend after write callback failure, lost reply, partial/truncated delivery,
timeout or restart. Pipe backpressure is not non-delivery proof. Duplicate invoke
frames cannot cause a second write. A null expired claim means no invocation may
be sent. Worker launch/readiness/claim failure must close current owned resources.

The worker's sole effect is an actual SQLite append to its fixed witness target,
using the accepted mock.record invocation and schema. No attempt deduplication in
that witness is added to mask a controller resend; duplicate writes remain visible.
The independent coordinator observer reads only after that writer's exit is verified.
No worker-supplied proof, PID, exit assertion or result summary substitutes for it.

## 4 Successful result and failure

Accept success only after verified owned-child exit0, complete valid transcript
with exactly one ready and one matching result, and exactly one matching independent
witness row. Defer settlement/member done report until exit/stdout EOF and full
transcript validation, so a duplicate or late malformed frame cannot follow an
already accepted done report. Use existing settle then bound-member report APIs;
they retain core task/result separation. No new task/approval/effect event vocabulary.

Nonzero/early exit, launch/protocol error, timeout or ambiguous post-claim delivery
is a failure. Record observeFailure through the trusted owner: crash for synthetic
exit/protocol/launch failures, hang for operation deadline. Reasons describe this
reviewed worker fixture, not general provider diagnosis. Record one accepted notice
at most and preserve exact core decisions; no failure storm or retry loop.

Before any claim, known unclaimed failure can close planned/cancelled work failed
under the existing table. If a committed claim is still dispatching, observeFailure
keeps uncertainty in attention and retains slot/budget; already-settled known outcomes
follow the existing core table. Collect independent witness0/1/ambiguous evidence only
after verified exit, but do NOT automatically confirm or abandon. An explicit
fixture-owner existing resolve decision is required. Even proof1 then closes the
observed failed task failed; it must not be upgraded to done. Explicit later handoff
can queue fresh work, with new plan/approval/claim and preserved predecessor history.

Core storage-write exceptions are distinct from worker failure signals. Surface a
bounded error and freeze further controller dispatch; do not invent a worker crash,
synthesize a report or retry a claim/invocation to hide a storage failure. Clean up
current owned workers within the existing bounds. After verified writer shutdown,
inspect validated core history; a subsequent explicit fixture operation may inspect
or redeliver an exact idempotent core command, never obtain/send the claim twice.
A committed settlement or report whose reply was lost remains durable and must not
be undone or replaced with an invented failure. No unbounded retry loop is admitted.

If observation itself refuses/fails, do not fabricate success or free occupancy.
Return a bounded error preserving truthful replayable state, which may include a
committed observation when only its reply was lost.
An outcome is never labelled absent merely because stdout, transport or a worker
reply is missing. Other eligible members may progress while uncertainty holds a slot.

## 5 Stop and owned-process lifecycle

Worker operation bound is10 seconds, including readiness/work/result. On explicit
controller stop, first fence controller-local dispatch, then serialize and commit
existing owner session stop BEFORE requesting worker stop or forced termination.
No new start/claim/invocation is delivered after stop intent/acceptance; queued/
prepared core work follows existing stop semantics.

If the stop write fails or its outcome is ambiguous, do not label stop accepted
without a validated durable decision. Keep local dispatch fenced and perform bounded
owned-worker error cleanup even when storage is unavailable. This is error cleanup,
not a claimed accepted core stop; retain actual core dispatch/attention history for
explicit later recovery. No inferred cancellation, absent effect or freed slot.

Request cooperative exit through the closed stop frame. If needed terminate only
the CURRENT owned child handle, with at most five seconds total teardown/verified
exit after stop/timeout cleanup begins. Never adopt/kill a persisted PID or trust
an identity supplied by a child. Retain owned handles/listeners until verified
exit; distinguish exit and complete stdio close. All callbacks remain bound to the
original job/effect/attempt; duplicate/late callbacks cannot settle/report a new job.
Unverified teardown is an inconclusive/failing run, not a pass or an absent effect.

Intentional stop is not automatically a crash notice. Ignore late done candidates
for work interrupted by accepted stop; do not infer done or disappearance. Wait
for writer exit, independently observe and leave unresolved effects for explicit
existing owner resolution. A done report committed before stop remains stable;
stop winning first prevents a later done report. Track this order in core events.
The accepted stop may leave core attention even after every worker is gone.

On controlled worker crash/hang, retain conservative state without resend. On core
reopen use existing recovery fence; open performs no execution. This slice does not
promise recovery/containment of live workers after an abrupt controller/whole-host
death. It must not guess survivors or resume dispatch against unverified writers.
Controller-crash survivor management and general process-tree containment remain
separate gates; tests here terminate workers while their current controller lives.

## 6 Required exit evidence

Parent review must pin new process reachability, exact spawn path/argv/environment,
protocol/state machine, source/test/compiled/runtime/native hashes before execution.
Add the ENTIRE mock-team source inventory to preflight; hashing only packages/core
is insufficient. Preserve all181 accepted tests and historical seals. Required
real SQLite/owned-worker/independent-observer cases:

1. Core import restrictions unchanged; fixed executable/worker and public environment;
   unknown fixture mode/path/protocol/extra identity input refuses before execution.
2. Two approved members execute concurrently within configured cap; FIFO and
   waiting approval/question block retain occupancy; six-assignment scenario bound;
   no invocation before claim/approval or after expiry/stop. Deterministic barriers
   prove overlap/order; arbitrary sleeps are not concurrency evidence.
3. Normal worker exit/transcript/proof leads to one done report; worker result alone,
   malformed/duplicate/late/truncated frames, ID mismatch, extra output, nonzero exit,
   write failure and unavailable/duplicate/conflicting proof cannot infer success.
4. Crash/hang before write and after actual witness COMMIT: observed0/1 respectively,
   one claim/notice, no resend, uncertainty retains FIFO/cap; explicit resolution
   closes failed, explicit fresh handoff/approval can later complete recovered mission.
5. SQLite claim/settlement/report/observation/stop transaction failure and lost reply:
   no invocation without committed claim, no duplicate delivery/report, durable
   state inspected through fresh open only after verified worker shutdown.
6. Stop at readiness, before write, after write and at result/exit boundary; core
   stop precedes interruption, actual writer exit verified, witness0/1 preserved,
   late result cannot create done, pre-stop done remains stable, no owned survivor.
7. Forced timeout/teardown and callback races use current owned handles; verify
   closure/stdio completion within bounds; no PID adoption, process discovery/kill
   by name, leftover worker or foreign/unowned action. Test cleanup is limited to
   generated verified fixture roots and owned handles, with finally cleanup.
8. Full baseline plus harness checks, source-bound retained raw captures and safe
   summaries/digests. Ten-second operation/five-second teardown bounds remain;
   suite-wide deadline must be explicitly budgeted from the finite scenario matrix
   before execution, with incremental streams and inconclusive timeout reporting.

No schema8, migration/reset, arbitrary program execution, general dispatcher,
external provider/CLI/credentials, real project/files/Git/export, terminal/UI/
network/MCP, automatic approval/retry/abandonment/takeover/succession, hostile-code
isolation, controller/whole-host power-loss recovery, throughput, Electron/WSL ABI
or release qualification follows. Exit maps precisely which Phase2 execution and
Architecture4.4/4.6/4.7 behavior is covered and ends this construction exception.

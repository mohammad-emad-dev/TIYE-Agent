# Proposed fixed offline Leader-coordination contract

## Capability and binding

Add an explicit coordination factory/profile to the private adapter/loop packages.
Preserve all old factories, codecs, outcomes and tests. Do not add a generic tool
registry or transport. Fresh schema7 and core/mock-team production code stay fixed.

A trusted coordinator supplies closed version/sessionId/memberId binding for the
actual Leader of an active session. No Leader assignment is required. Refuse a
non-Leader or foreign session before capturing the writer or creating an adapter.
One coordination loop/adapter and one conversation per scenario are permitted.

The trusted coordinator supplies an immutable catalog of at most six existing
prepared tasks in that store, each with a unique opaque taskRef and taskId.
At construction, require each task to be `created` and unassigned in the checked
projection. No model text can create or change titles, instructions or catalog
bindings. Member references use unique opaque memberRef values bound to the
immutable roster, at most five. References must be bounded nonempty ASCII tokens
matching `^[A-Za-z][A-Za-z0-9_-]{0,31}$`, distinct within their namespace.
Model references are exact catalog selectors, never paths, commands or raw IDs.

Only the narrow bridge captures the existing Leader-bound `enqueue` writer and
checked context/snapshot readers. The loop receives no store, owner/member handle,
scheduler, database path, effect plan, proof or task-creation capability. Catalog
selection may choose the target task/member from the trusted set; it cannot choose
the actor, session, command ID or permission. No implicit authorizations follow
from a taskRef or memberRef. Revalidate session/Leader and catalog mappings at use.
This checks immutable identity mappings, not a promise that a task remains created;
subsequent task eligibility is decided by the actual core enqueue operation.
The trusted initial structured request includes only detached taskRef entries
and roster memberRefs/roles, plus bound context. The catalog's taskIds remain
private until an accepted receipt or session assignment status exposes them.
No model field may replace or append to this trusted catalog. Its encoding and
size count toward the same request/history budgets; this is not prompt-only
access control.

## Status projection

`get_team_status` accepts exactly `{}`. Derive one detached immutable result from
one fresh replay-checked `snapshot()`, never an inconsistent combination of reads.
The bridge validates the bound active session/Leader within that same projection.
The result is exactly version/sessionId/status/maxConcurrent/members/tasks.
Status is `active`; there are at most five roster-ordered member rows and at most
100 assignment rows, ordered by enqueueSequence. No truncation or silent omission.

Each member row contains memberRef, role (`leader` or `member`), activeTaskId
(UUID or null), and FIFO queuedTaskIds. Each task row contains taskId, memberRef,
state, closed, enqueueSequence and result. Result is null or the core's exact
status/summary pair. Include only this session's validated assignments; retain
the exact core task state, including blocked, needs_attention and failed. Active
occupancy means a nonclosed assignment with an effectId, even when blocked or
uncertain. Queued rows are nonclosed assignments without an effectId, using the
existing inbox ordering. Do not infer provider liveness, success or free capacity
from prose or effect completion. Prepared unassigned catalog tasks do not appear
as inbox work; expose their taskRefs separately in the trusted initial input.

Do not expose instructions, proofs, effects/payloads, approval data, command
history, raw failure/question/handoff bodies, paths or foreign tasks. Validate
the complete result before exposure, at most 24 KiB UTF-8, within the shared
32 KiB history budget. Overflow refuses the read, never truncates it. A status
result is knowledge at read time, not authorization for a later enqueue. No
core writes are permitted from a read-only conversation.

## Delegation and actual receipt

`delegate_task` arguments are exactly `{taskRef,memberRef}`. Only catalog/roster
matches are allowed. It means queue this prepared task once for this one member;
it does not execute work or create instructions. Unknown fields/tools, raw IDs,
parallel/mixed calls, invalid Unicode, duplicate/late IDs and wrong request/run/
turn/generation bindings refuse before any core operation. Preserve whole valid
transcript and independent verified local transport closure before dispatch.

Reserve the call, one private UUIDv4 command ID, one enqueue attempt and capacity
for a real continuation before the writer. Construct canonical
`team.task.enqueue` version1 with trusted session/task/member IDs. The bridge
uses `member.enqueue(bytes)` once. The core remains authoritative for its existing
eligibility, duplicate-command and event-capacity rules. Fresh active checks are
required immediately before writing without an await/yield gap. A stale status
or a task already queued by a trusted coordinator must not be treated as success
of this command. A known core rejection is a valid rejected receipt.

The receipt is exactly callId/commandId/sessionId/taskRef/memberRef/decision/
assignment. For accepted, validate the actual command record against canonical
actor-bound command hash and accepted result, plus the actual assignment's session,
task, member and enqueueSequence. Its task must actually be queued, effectId null,
closed false and result null at that read. Return assignment exactly taskId/
memberId/enqueueSequence, with a positive safe-integer enqueueSequence. For rejected,
validate the actual matching rejected
command and return assignment null, even if a prior command queued that task.
Do not substitute the current inbox contents for this command's decision.
The core's current enqueue hash is SHA-256 over UTF-8 JSON of
`["team.task.enqueue",1,actor,commandId,sessionId,taskId,memberId]`, where actor is
the bound Leader. Verify that exact format against engine-inbox.ts/record.ts;
do not import unexported core internals or expand the public core API. Validate
command and assignment together in one fresh checked projection after the return.

Append an immutable paired call/receipt only after validation. The fixed backend
must validate and use that receipt in one actual text-only continuation. A known
receipt survives failed continuation, failed final fresh check or local stop.
Delegation state none/accepted/rejected/uncertain is separate from conversation
completion and task completion. Prose never queues a task or reports it done.

Any exception or measured overrun after entering the writer, including lost
acknowledgement/receipt validation failure, yields explicit delegation uncertainty,
consumes the attempt/IDs, sends no continuation and permits no retry or later run.
Verified local cleanup cannot turn a write uncertainty into known rejection.
Coordinator inspection/reopen/replay may reveal the actual durable decision but
cannot acknowledge it to the terminated run or rearm that run.

## Bounds and stop ordering

At most three requests and two tools: one optional get_my_context OR get_team_status
read, then at most one delegate_task. A text-only or read-only conversation is
allowed. Delegation is the final tool even after rejection; any tool emitted in
its continuation fails before core access. Reserve continuation capacity and
all applicable byte/message limits before writing. No automatic status polling,
second delegation, task start, report, question, answer, handoff or completion.

Preserve eight messages/32 KiB history, 64 KiB received bytes, 64 retained events,
16 observers, eight controller checks, 10-second request/read/write overrun limit
and 5-second cleanup limit. Publish exact check accounting before execution.
Synchronous native calls have elapsed overrun detection after return, not
preemption. Keep used IDs/attempts consumed after local validation failures.

Use the existing owned pump and isolated observers; no writer in adapter callbacks.
Stop before writer admission causes zero enqueue calls. A known decision returning
first remains known through later stop. Coordinator core stop and loop fencing
must use finally so rejected/failed core stop cannot leave local work admitted.
Stop can cancel an accepted queued assignment; keep the receipt as the historical
acceptance, not a claim that it is still queued. Fresh active-session checks govern
continuation/final acceptance; this profile has no completed-session exception.
Already-created requests remain counted and aborted once; unverified cleanup is
needs_attention. Dispose owned loop/adapter work before closing stores/roots.
Only the fixed normalizing-stop adapter is admitted; the outstanding generic
rejecting-stop integration requirement remains open.

## Execution evidence and exit

Before first new runtime execution, parent reviews actual source/tests and records
a finite real-core/fixed-transport matrix and aggregate budget. Pin source, tests,
compiled outputs, runtime/native dependencies and exact owner approval. Keep
incremental raw streams and failed captures; no silent retries or deadline changes.
Use only the existing owned fixtures. Retain all 454 prior cases and old profiles.

Required cases: Leader without an assignment; non-Leader/foreign binding refusal;
catalog/roster/closed-field injection; queued/running/blocked/uncertain/closed result
status and exact FIFO; six-task/100-assignment and byte-bound behavior; one-snapshot
status consistency and no writes; direct and status/context-then-delegation success;
actual receipt in actual continuation; busy-target enqueue without occupancy change;
stale status/already-assigned task rejection; core event-limit refusal; repeated-run
and post-delegation tool refusal; malformed/mixed/unclosed/late calls; actual SQLite
abort and lost replies for accepted/rejected commands; measured write overrun;
stop before/after enqueue and during continuation; rejected/failed core stop;
observer reentrancy; closed-store/final-check failure; reopen/replay and no retries.

Trusted setup may start/settle tasks through existing helpers solely to construct
status cases; the model bridge never receives those capabilities. Prove accepted
delegation creates only inbox intent: no plan, approval, claim or invocation. Exit
maps only these restricted tools to Architecture4.2/offline5.1/5.3, ends this
exception and grants no subsequent scope. Full delegation and the complete product
remain unfinished.

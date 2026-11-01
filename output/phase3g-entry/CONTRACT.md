# Proposed fixed offline Leader-handoff contract

## Capability and binding

Add an explicit handoff factory/profile to the private adapter/loop packages.
Preserve all old factories, codecs, outcomes and tests. Do not add a generic tool
registry or transport. Fresh schema7 and core/mock-team production code stay fixed.

A trusted coordinator supplies closed version/sessionId/memberId binding for the
actual Leader of an active session. Refuse a non-Leader or foreign session before
capturing the writer or creating an adapter. One handoff loop/adapter and one
conversation per scenario are permitted.

The trusted coordinator supplies an immutable catalog of at most six eligible
failed tasks in that store, each with a unique opaque taskRef and taskId. At
construction, require each task to be `failed` with a closed failure notice for
that session and no existing handoff edge and no open question in the checked
projection. No model text can create or change catalog bindings. Member
references use unique opaque memberRef values bound to the immutable roster, at
most five. References must be bounded nonempty ASCII tokens matching
`^[A-Za-z][A-Za-z0-9_-]{0,31}$`, distinct within their namespace. Model
references are exact catalog selectors, never paths, commands or raw IDs. The
successor task identity is never a model field.

Only the narrow bridge captures the existing Leader-bound `handoff` writer and
checked context/snapshot readers. The loop receives no store, owner/member
handle, scheduler, database path, effect plan, proof, failure-observation or
task-creation capability. Catalog selection may choose the predecessor task,
target member and the successor title from the trusted set; it cannot choose
the actor, session, command ID or successor task ID. No implicit authorizations
follow from a taskRef or memberRef. Revalidate session/Leader and catalog
mappings at use. This checks immutable identity mappings, not a promise that a
task remains an eligible failure; subsequent eligibility is decided by the
actual core handoff operation. The trusted initial structured request includes
only detached taskRef entries for eligible failures, roster
memberRefs/roles, plus bound context. The catalog's taskIds remain private until
an accepted receipt or the handoff record exposes them. No model field may
replace or append to this trusted catalog. Its encoding and size count toward
the same request/history budgets; this is not prompt-only access control.

## Handoff and actual receipt

`handoff_task` arguments are exactly `{taskRef,memberRef,title}`. Only
catalog/roster matches are allowed; the title is bounded nonempty Unicode text
of at most 256 code points, 1024 UTF-8 bytes and no surrogates. It means create
one queued successor task for this one member from this one failed task; it does
not execute work or carry instructions. Unknown fields/tools, raw IDs,
parallel/mixed calls, invalid Unicode, duplicate/late IDs and wrong request/run/
turn/generation bindings refuse before any core operation. Preserve whole valid
transcript and independent verified local transport closure before dispatch.

Reserve the call, one private UUIDv4 command ID, one private successor task ID
and capacity for a real continuation before the writer. Construct canonical
`team.task.handoff` version1 with trusted session/predecessor IDs, the reserved
successor task ID, the trusted target member and the selected title. The bridge
uses `member.handoff(bytes)` once. The core remains authoritative for its
existing eligibility, duplicate-command, lineage and capacity rules. Fresh active
checks are required immediately before writing without an await/yield gap. A
stale catalog or a task already handed off by a trusted coordinator must not be
treated as success of this command. A known core rejection is a valid rejected
receipt.

The receipt is exactly callId/commandId/sessionId/taskRef/memberRef/decision/
handoff. For accepted, validate the actual command record against the canonical
actor-bound command hash and accepted result, plus the actual handoff record's
session, predecessor, successor, target member, title and author, and the actual
successor assignment's session, task, member, queued state, null effect and null
result at that read. Return handoff exactly successorTaskId/targetMemberId/
handoffSequence, with a positive safe-integer handoffSequence. For rejected,
validate the actual matching rejected command and return handoff null, even if a
prior command handed off that task. Do not substitute the current lineage for
this command's decision. The core's current handoff hash is SHA-256 over UTF-8
JSON of
`["team.task.handoff",1,actor,commandId,sessionId,predecessorTaskId,successorTaskId,targetMemberId,title]`,
where actor is the bound Leader. Verify that exact format against
engine-handoff.ts/record.ts; do not import unexported core internals or expand
the public core API. Validate command and handoff record together in one fresh
checked projection after the return.

Append an immutable paired call/receipt only after validation. The fixed backend
must validate and use that receipt in one actual text-only continuation. A known
receipt survives failed continuation, failed final fresh check or local stop.
Handoff state none/accepted/rejected/uncertain is separate from conversation
completion and task completion. Prose never hands off a task or reports it
rehabilitated.

Any exception or measured overrun after entering the writer, including lost
acknowledgement/receipt validation failure, yields explicit handoff uncertainty,
consumes the attempt/IDs, sends no continuation and permits no retry or later
run. Verified local cleanup cannot turn a write uncertainty into known
rejection. Coordinator inspection/reopen/replay may reveal the actual durable
decision but cannot acknowledge it to the terminated run or rearm that run.

## Bounds and stop ordering

At most three requests and two tools: one optional get_my_context read, then at
most one handoff_task. A text-only or read-only conversation is allowed. The
handoff is the final tool even after rejection; any tool emitted in its
continuation fails before core access. Reserve continuation capacity and all
applicable byte/message limits before writing. No automatic status polling,
second handoff, task start, report, question, answer, delegation or completion.

Preserve eight messages/32 KiB history, 64 KiB received bytes, 64 retained
events, 16 observers, eight controller checks, 10-second request/read/write
overrun limit and 5-second cleanup limit. Publish exact check accounting before
execution. Synchronous native calls have elapsed overrun detection after return,
not preemption. Keep used IDs/attempts consumed after local validation failures.

Use the existing owned pump and isolated observers; no writer in adapter
callbacks. Stop before writer admission causes zero handoff calls. A known
decision returning first remains known through later stop. Coordinator core stop
and loop fencing must use finally so rejected/failed core stop cannot leave
local work admitted. Stop can close an accepted queued successor; keep the
receipt as the historical acceptance, not a claim that it is still queued.
Fresh active-session checks govern continuation/final acceptance; this profile
has no completed-session exception. Already-created requests remain counted and
aborted once; unverified cleanup is needs_attention. Dispose owned loop/adapter
work before closing stores/roots. Only the fixed normalizing-stop adapter is
admitted; the outstanding generic rejecting-stop integration requirement remains
open.

## Execution evidence and exit

Before first new runtime execution, parent reviews actual source/tests and
records a finite real-core/fixed-transport matrix and aggregate budget. Pin
source, tests, compiled outputs, runtime/native dependencies and exact owner
approval. Keep incremental raw streams and failed captures; no silent retries or
deadline changes. Use only the existing owned fixtures. Retain all 507 prior
cases and old profiles.

Required cases: Leader handoff of an eligible failed task with actual
continuation receipt; non-Leader/foreign binding refusal; catalog/roster/closed-
field injection; successor queued assignment and immutable lineage without
touching the failed predecessor; eligible-then-ineligible states (queued,
running, blocked, uncertain, done, cancelled, unobserved or already-handed
predecessors) and exact rejection; unknown member, duplicate handoff of one
predecessor and capacity refusal; two handoffs of the same failed task;
successor-identity and title grammar bounds; malformed/mixed/unclosed/late
calls; tools after rejected handoff; accepted/read/prose boundaries; real
SQLite abort and lost replies for accepted/rejected commands; measured write
overrun; stop before/after handoff and during continuation; rejected/failed core
stop; observer reentrancy; closed-store/final-check failure; reopen/replay and
no retries.

Trusted setup may fail tasks through existing helpers solely to construct
eligibility cases; the model bridge never receives those capabilities. Prove an
accepted handoff creates only the queued successor assignment and handoff record:
no plan, approval, claim or invocation. Exit maps only this restricted tool to
Architecture4.2/4.3/offline5.1/5.3, ends this exception and grants no subsequent
scope. Full rehabilitation, automatic succession and the complete product remain
unfinished.

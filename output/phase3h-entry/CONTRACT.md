# Proposed fixed offline Leader failure-view contract

## Capability and binding

Add an explicit failure-view factory/profile to the private adapter/loop
packages. Preserve all old factories, codecs, outcomes and tests. Do not add a
generic tool registry or transport. Fresh schema7 and core/mock-team
production code stay fixed.

A trusted coordinator supplies closed version/sessionId/memberId binding for
the actual Leader of an active session. Refuse a non-Leader or foreign session
before capturing the viewer or creating an adapter. One failure-view
loop/adapter and one conversation per scenario are permitted.

Only the narrow viewer captures the existing Leader-visible `failures()`
reader and checked context/snapshot readers. The loop receives no store,
owner/member handle, scheduler, database path, effect plan, proof, failure
observation or task-creation capability. No implicit authorizations follow
from a member reference. Revalidate session/Leader mapping at use. This checks
immutable identity mappings, not a promise that any task remains failed;
subsequent eligibility is decided by the actual core handoff operation, not by
this read. The trusted initial structured request includes only bound context
and the roster's memberRefs/roles. No model field may replace or append to the
trusted roster. Its encoding and size count toward the same
request/history budgets; this is not prompt-only access control.

## Failure projection

`get_failures` accepts exactly `{}`. Derive one detached immutable result from
one fresh replay-checked `snapshot()`, never an inconsistent combination of
reads. The bridge validates the bound active session/Leader within that same
projection and calls the existing member `failures()` reader once for the
bound Leader. The result is exactly version/sessionId/status/failures. Status
is `active`; failures is a session-scoped ordered array of at most 100 rows
sorted by observedSequence ascending; no truncation or silent omission. Absent
a durable row, the array is empty — knowledge at read time, not proof that no
failure ever occurred.

Each row contains taskId, memberRef, reason (`crash`, `hang`,
`rate_limit`, `auth`, `network`), summary (bounded core text semantics, at
most 256 code points and 1024 UTF-8 bytes, no surrogates), observedSequence
(positive safe integer), status (`awaiting_reconciliation` or `closed`) and
closedSequence (the safe-integer closing sequence when closed, else null).
Member rows reference the roster: memberRef maps the immutable member order,
role is `leader` or `member`. Raw member UUIDs are never exposed, matching
the status projection precedent; taskIds appear raw as in that projection. Include only this session's Leader-visible
notices; retain exact core semantics including open-question cancellation,
uncertain effect state and already-handed edges. Do not infer liveness,
provider cause, remediation steps or eligibility for handoff from this read.

Do not expose effect payloads, approval data, command history, question
bodies, handoff lineages, paths or foreign sessions. Validate the complete
result before exposure, at most 24 KiB UTF-8 within the shared 32 KiB history
budget. Overflow refuses the read, never truncates it. A failure row is
knowledge at read time, not authorization for a later handoff. No core writes
are permitted from this profile; any tool emitted after or beside a completed
read that is not the permitted continuation refuses before core access.

## Bounds and stop ordering

At most three requests and one read tool: one optional get_my_context OR
get_failures. A text-only conversation with no read is allowed. The read
never reserves commands, attempts or continuation capacity beyond the
existing history/byte budgets. No second read, no automatic polling, no task
start, report, question, answer, delegation, handoff or completion.

Preserve eight messages/32 KiB history, 64 KiB received bytes, 64 retained
events, 16 observers, eight controller checks, 10-second request/read elapsed
overrun limit and 5-second cleanup limit. Publish exact check accounting before
execution. Synchronous native calls have elapsed overrun detection after
return, not preemption. Keep used IDs consumed after local validation
failures.

Use the existing owned pump and isolated observers; no viewer in adapter
callbacks. Core stop and loop fencing must use finally so rejected/failed core
stop cannot leave local work admitted. Already-created requests remain counted
and aborted once; unverified cleanup is needs_attention. Dispose owned
loop/adapter work before closing stores/roots. Only the fixed
normalizing-stop adapter is admitted; the outstanding generic rejecting-stop
integration requirement remains open.

## Execution evidence and exit

Before first new runtime execution, parent reviews actual source/tests and
records a finite real-core/fixed-transport matrix and aggregate budget. Pin
source, tests, compiled outputs, runtime/native dependencies and exact owner
approval. Keep incremental raw streams and failed captures; no silent retries
or deadline changes. Use only the existing owned fixtures. Retain all 552
prior cases and old profiles.

Required cases: Leader reads empty, awaiting-only, closed-only and mixed
failure sets with actual core notices; notices reflect open-question
cancellation and uncertain/closed states faithfully; non-Leader/foreign
binding refusal; mixed/closed-field injection; malformed/unclosed/duplicate
reads; second-tool refusal after the one admitted read; accepted/read/prose
boundaries; real SQLite abort and lost replies are not applicable (no write)
— instead prove aborted snapshot reads fence uncertainty without retry;
measured read overrun; stop before/during read and during continuation;
rejected/failed core stop; observer reentrancy; closed-store/final-check
failure; reopen/replay and no retries.

Trusted setup may record failures through existing helpers solely to
construct visibility cases; the model bridge never receives those
capabilities. Prove an accepted read creates no command, assignment or
lineage: durable commands, assignments, failures and handoffs are identical
before and after. Exit maps only this restricted read to
Architecture 4.2/4.7/offline 5.1/5.3, ends this exception and grants no
subsequent scope. Full supervision, automatic succession and the complete
product remain unfinished.

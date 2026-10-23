# Phase 2A: headless synthetic team engine contract

**Proposed only.** Approval of [AMENDMENT.md](AMENDMENT.md) is required before engine
source development. This contract narrows the first engine slice; it does not
replace the complete product behavior in Architecture 4 or authorize its adapters.

## 1. Storage and execution boundary

Extend the accepted core's command/event/replay machinery. Queue state, effect
state, command decisions and session state live in one database under one owner.
Do not implement a queue database or wrapper that commits a reservation separately
from its synthetic effect plan. A composite start command has one decision and
one canonical event and one atomic state change. Its event binds the complete
validated command and deterministic accepted/rejected decision. Projection changes
are derived from that single event, so partial composite event sequences cannot
be committed. Existing effect lifecycle commands still use their single events.

Use fresh schema 3 roots with exact application/schema recognition. Existing
schema 1/2 APIs remain supported in their original roots. There is no data import,
merge, reset, migration or downgrade. Share the existing reviewed storage and
effect lifecycle implementation rather than copying it into an independent engine.
The implementation review must pin exact event schemas and schema 3 tables before
execution; this proposal is not a hash approval for unwritten code.

The product core stays a synchronous headless library. The trusted coordinator
owns serialized calls and Windows private-root allocation. The only test children
are the fixed core host and independent witness already qualified in the core
slice, updated and reviewed before execution. No engine process launcher, generic
callback, plugin, executable selector or network server is introduced.

## 2. Session and identity

- At most one session per fresh database, with 1–5 immutable member IDs and exactly
  one leader ID among them. UUIDs use the existing lowercase v4 grammar.
- `maxConcurrent` is a non-boolean integer from 1 through roster size. All members,
  including the leader, have inboxes and may receive assignments.
- Names and instructions are bounded using existing Unicode scalar/UTF-8 rules;
  no provider/model/account configuration is accepted by the engine.
- The trusted coordinator creates role-bound in-process handles for owner,
  scheduler, leader and each member. Actor identity comes from that bound handle,
  not from a caller-selectable command field. Commands hash the resolved identity.
  The fixture dispatcher cannot select another member or privileged handle from
  wire data. Leader-only enqueue and matching-member reporting enforce the roster.
  No privileged raw store is handed to member fixtures. This is an internal
  coordinator boundary, not authenticated MCP/UI or isolation from hostile code
  already executing in the trusted process.
- Roster mutation, leader succession, reassignment and changing concurrency are
  deferred. Stop is terminal for this session; later work uses a fresh session.

## 3. Commands and durable decisions

The implementation must specify closed, version-1 DTOs, byte bounds and ordered
UTF-8 SHA-256 hash arrays before execution. Each command binds its type/version,
command ID, session, actor and all relevant payload fields. A command ID shares the
core ledger with task creation, planning and resolution. Hash conflicts refuse
without writes. Exact redelivery returns its original accepted/rejected decision
before checking current state. Malformed input refuses before admission; admitted
semantic rejections are durable events with no unauthorized state transition.

The concrete command set is bounded to:

| Command | Preconditions and atomic result |
| --- | --- |
| Session create | No existing session; valid distinct roster, leader and concurrency. Persist session and empty inboxes. |
| Enqueue task | Active session, leader actor, existing `created` core task, roster member, task not assigned elsewhere. Record one assignment and FIFO sequence. |
| Start queued task | Trusted scheduler actor; active session; named task is that member's oldest queued assignment; member idle; global reservation cap available. Atomically reserve member/slot and record that task's exact synthetic effect plan. |
| Report result | Actor matches active assignment member; terminal reconciled effect; bounded summary and explicit status. Close assignment and release its reservation. |
| Stop session | Trusted owner fixture actor; atomically close admission and cancel all unstarted assignments. Stop planned effects; dispatched uncertain effects require reconciliation. |
| Recover session | Trusted owner after reopening; record recovery of newly interrupted in-flight assignments before further admission. Never start or send an instruction. Repeated recovery of the same acknowledged phase cannot create another state change. |

Start must name the expected queue head, effect ID, attempt ID, target ID, payload
and expiry. No queue jumping or implicit ID generation is allowed. Effect/attempt
identities remain unique across the entire core. One task admits one assignment
and one effect in this slice. New retries/reassignment require later scope.

At most 100 assignments may be admitted over the lifetime of the session.
Cancellation/completion frees live queue/reservation occupancy, not that lifetime
budget. History remains capped at 1,000 events. Reserve one session-stop event
until stop commits, plus eight terminal-work events for each newly enqueued
assignment: start, approval, claim, recovery, settlement, explicit resolution,
report and one spare. Assigned effects use this budget instead of being counted
again in the legacy effect reserve; unassigned effects retain their existing reserve.

An assignment's remaining budget decreases only for its accepted lifecycle events,
never for rejected traffic, and is released at terminal closure. A composite stop
uses the single session reserve and derives all affected transitions from bounded
history; it does not serialize a giant list of task bodies into the event. A
recovery phase may consume its terminal reserve once for the sole attempt; repeated
observation cannot consume it again. Extra/no-op/rejected requests use unreserved
space or refuse admission. No unlimited crash/rejection-retention guarantee follows.

Before every append require resulting event count + remaining assignment budgets
+ unassigned effect reserves + remaining session-stop reserve <= 1,000. Source
review must verify this formula covers every accepted path and full-capacity stop.
A rejected or lost start cannot consume a phantom reservation or restore budget.

## 4. Queue and state semantics

FIFO is ordered by accepted enqueue event sequence per member. Rejected enqueues
do not create slots or move a task. A member holds at most one active reservation;
the session holds at most `maxConcurrent`. Different idle members may reserve work
up to that cap through serialized transactions. No concurrent SQLite writers are
implied by concurrent logical assignments.

Engine assignments and effect states are separate domains. A start reserves a
slot; it is not evidence that a CLI is running. The derived engine view shows
queued, waiting_approval, running, reconciling, needs_attention or terminal status
from assignment history plus the existing effect/approval lifecycle:

| Condition for an assigned task | Engine task state |
| --- | --- |
| Accepted enqueue, no start | queued |
| Started, exact approval absent | waiting_approval |
| Approved active reservation, including normal in-flight action | running |
| Recovery accepted for an interrupted dispatched attempt, not yet settled | reconciling |
| Uncertain effect or explicitly abandoned effect awaiting normal failed report | needs_attention |
| Proven completed effect, no result report | running; still owns its reservation |
| Accepted normal done/failed report | done/failed |
| Stop cancels queued or unclaimed planned work | cancelled |
| Stop with dispatched uncertainty | reconciling/needs_attention until resolved |

Assigned-task registry queries must expose this mapping consistently. Shared task,
assignment and effect projections change in the same event transaction; effect
state must not be copied blindly into the engine task state. Unassigned tasks
retain the prior core vocabulary. Enqueue consumes their eligibility for direct
planning; only the composite engine start may attach their one effect. Normal
results cannot leave a terminal assignment paired with a reusable created task.

An effect's witness completion does **not** finish a normal engine task. Only an
explicit accepted `report_result` does. A `done` report requires matching completed effect
evidence; a `failed` report requires a terminal reconciled effect, including explicit
uncertain closure. Abandoned effects cannot be reported done. Paused or dispatched
uncertain effects cannot free a member/slot through result prose or timeout.

Queued cancellation frees queue capacity. For started work, stop prevents all
new claims and starts. A still-planned effect can become cancelled. A dispatched
attempt becomes reconciling/attention; an issued invocation cannot be revoked.
The trusted fixture stops issuing actions immediately on stop. No OS termination
or cancellation guarantee follows. Terminal cancelled effects may close their
stopped assignment atomically. For stopped work only, explicit resolution may
close it cancelled/failed when the effect is terminal; it can never infer done.
Uncertainty remains reserved until that explicit terminal closure. Stop redelivery
must not create another cancellation/claim or change the original decision.

## 5. Recovery and observation

Reopen reconstructs session, inbox order, assignments, reservations and views from
validated events and checks all materialized projections. No member relaunch or
queued task start happens automatically on open.

For an existing plan with no committed claim, a first claim remains subject to
current session admission and exact approval. A dispatched attempt is never sent
again; observe the fixed independent witness after its writer exits. Exactly one
matching append can reconcile the effect; missing/malformed/conflicting/duplicate
proof pauses that assignment. Existing explicit resolution remains available and
must bind the actual attention sequence. Unrelated eligible members may progress.

Session stop must also gate existing core claim entry points for assigned tasks;
checking only the scheduler would leave a bypass. Unassigned legacy tasks are
outside the session; the implementation must expose that distinction explicitly
and may not accidentally grant them session-member authority.

## 6. Exit evidence

Parent review must bind actual source/tests/compiled files, runtime version and
installed native dependency hashes before the first run. Keep raw captures local
and publish summarized verdicts/digests. Retain the current 45-test regression
baseline and immutable historical evidence.

Required real SQLite/fresh-process cases:

1. Session creation, role/actor refusal, exact redelivery and changed-ID conflicts.
2. Per-member FIFO, one reservation/member and global cap, including a member
   waiting for approval and unrelated member progress.
3. Start transaction rollback leaves no assignment reservation or effect plan;
   accepted/rejected starts recover their original decisions after lost replies.
4. Independent witness counts expose duplicate dispatch. Reopen/reconciliation
   never appends another witness record or marks the task done without a report.
5. Uncertain member remains paused; another member completes. Done reporting cannot
   bypass proof, role checks, FIFO, cap or explicit attention resolution.
6. Stop with queued, planned and dispatched work; every public claim/start path is
   gated. No new action follows stop in the controlled fixture. Existing uncertainty
   stays visible, and stop/result redelivery does not release slots twice.
7. Capacity exhaustion still permits admitted terminal/stop work; malformed or
   tampered session, assignment, event and projection data refuses without reset.
8. Fresh child crashes before/after session/enqueue/start/report/stop commits,
   with a fresh observer checking exact persisted state and witness counts.

Every child has a ten-second operation deadline and at most five seconds verified
owned-handle teardown. Full host crash, power loss, hostile mutation, Electron/WSL
runtime, authenticated callers, MCP, real provider/CLI execution, takeover,
questions, file ownership and the UI remain outside this slice.

Exit review must report precisely which Architecture 4 behaviors are implemented
and which remain deferred. Passing Phase 2A cannot close native/provider gates or
imply a complete team engine or complete product.

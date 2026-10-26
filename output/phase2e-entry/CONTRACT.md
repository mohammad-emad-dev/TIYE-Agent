# Phase 2E: explicit recovery handoffs and successful mission closure

Proposal only. Baseline2aa8abf: Phase2D exit,158 passing tests. Target is the logical
handoff subset of Architecture4.7 and its necessary mission-completion behavior.

## 1 Storage and compatibility

Reuse TaskStore, one synchronous SQLite writer, shared ledger/events/replay,
exclusive lifetime lease and private-root checks. Proposed explicit
`createHandoffEngine(directory)` / `openHandoffEngine(directory)` use fresh schema7:
exact schema6 tables plus STRICT `handoffs(id,value)` keyed by predecessorTaskId.
Existing schema1–6 entry points and operation semantics remain unchanged. No new
database, migration, repair, import, reset or downgrade. Replay derives handoffs,
tasks/assignments/titles and mission eligibility, comparing stored projections.
Disagreement refuses open, without persisted rebuilding or read-only fallback.

Only existing fixed owned host/witness composition, with reviewed coordinator role
binding, may execute after actual-source/test/compiled/runtime/native preflight.
No executable, actor or privileged handle is selected through member wire data.
These roles constrain trusted internal callers, not hostile same-process code.

## 2 Command, identity and ledger

Member handles add `handoff(bytes)`; only the immutable Leader may succeed. Owner
has no handoff-writing method. Leader requires no task/reservation of its own.
DTO exactly `{type:"team.task.handoff",version:1,commandId,sessionId,
predecessorTaskId,successorTaskId,targetMemberId,title}`. Use existing compact
canonical UTF-8 <=16KiB, closed fields, numeric version1, lowercase UUID-v4 and
title1–256 Unicode scalars / <=1024 UTF-8 bytes, without lone surrogates or
normalization. No effect, attempt, approval, process, proof, caller actor or
desired predecessor status can be supplied. Title is data, not an execution plan.

Hash SHA-256 over UTF-8 JSON without trailing newline of
`["team.task.handoff",1,actor,commandId,sessionId,predecessorTaskId,successorTaskId,targetMemberId,title]`.
Actor is bound member UUID. Shared namespace with all existing commands; exact
ID/hash redelivery returns its original result before state/capacity/recovery.
Changed payload/type/actor refuses without writes. Malformed input refuses before
admission. New semantic rejections consume only unreserved space or refuse without
a decision. One event type `team.task.handoff`, exact `{command,actor,result}`,
result accepted/rejected. Replay independently validates decision/hash and effects.

## 3 Admission and atomic handoff

All acceptance conditions must hold:

- Matching active session and its bound immutable Leader; target is a roster member.
  Same member as predecessor or Leader itself is allowed explicitly, never selected
  automatically. Task-scoped failure does not revoke a member's identity.
- Predecessor assignment belongs to that session, is closed and has task state
  failed. It has exactly its existing closed failure notice for that task/member/
  sole attempt; pending or absent notices reject. The effect is completed,
  cancelled or abandoned, with no open question or remaining assignment/question
  units for the predecessor. Uncertain dispatching/attention cannot hand off.
- No prior accepted handoff for this predecessor, including stopped/closed history.
  Successor taskId is fresh across all accepted task history, not merely closed
  work. It cannot equal predecessor or name an already-created unassigned task.
- Fewer than10 lifetime accepted handoffs and fewer than100 lifetime assignments,
  counting all previous accepted records. Capacity may bind earlier.

One accepted event atomically creates successor title/task state queued, its FIFO
assignment to target and the lineage record. Initial assignment values match the
existing enqueue contract: effectId null, remainingEvents8, closed false,
recoveryAcknowledged false, result null, enqueueSequence = this accepted global
event sequence. No synthetic task.create/enqueue events or separate ledger entries
are fabricated. registry() must derive the accepted immutable title from this
event, including after reopen; rejected handoffs supply no title/task/assignment.

Lineage record exactly `{sessionId,predecessorTaskId,successorTaskId,fromMemberId,
targetMemberId,title,createdBy,handoffSequence}`. fromMemberId comes from predecessor,
createdBy is the bound Leader, sequence is the actual accepted global event.
No change to predecessor task state, member result, effect, failure notice,
questions, attempt or approval. Each predecessor has one outgoing edge and every
successor is newly created with one incoming edge; accepted history is acyclic.

A failed successor may receive its own handoff only after its own explicit failure
observation and closure. Chains share the same10 lifetime record bound. No branch,
reuse/cycle, resetting history or extra retry budget. Fresh IDs do not mean an old
effect can be claimed twice: ordinary planning still requires fresh effect/attempt
identity across the whole root and one effect per task.

## 4 Scheduling, visibility and successful mission

Handoff appends at the target's FIFO tail. It neither consumes a running slot nor
starts work; existing per-member/global limits apply when the trusted scheduler
explicitly starts it. Existing queued work keeps priority. No plan/payload/target
operation is copied. Explicit later planning, approval, claim, fixed witness and
matching-member result are required for the new task. Its own questions/failure/
stop behavior follows existing contracts. This queues new work that still requires
approval; it never automatically retransmits the predecessor. Semantic duplicate operations across
different explicitly approved effects are not automatically deduplicated.

Owner/member add `handoffs()` on schema7 only; older roots refuse. Detached rows
contain exactly the lineage fields above. Owner and Leader see all; another member
sees only records where it is fromMemberId or targetMemberId. No unrelated question
text, failure summary, witness proof, ledger or budget internals. Views do not grant
access to predecessor's restricted questions/failure details. Closed history remains.

Schema7 extends mission completion's eligibility, not task/effect terminal state:

- Nonempty session, bound Leader, active status, all accepted root tasks assigned
  and closed, all assignment/question units0, no open question or uncertain effect.
- Each task is either done with an explicit successful member result and completed
  effect, OR failed with an accepted outgoing handoff whose successor path ends in
  such a done task. Every intermediate failed task must itself have a closed failure
  notice and its accepted outgoing edge. All failed predecessors' effects remain
  completed/cancelled/abandoned, never silently upgraded or replayed.
- Every accepted effect belongs to its corresponding assignment; all task/edge
  identities and session membership are validated. Unassigned/created/queued/
  blocked/live/uncertain/cancelled tasks or uncovered failures prevent success.
  A failed member report without an accepted observed-failure handoff is uncovered.
- Keep the exact existing completion DTO/hash/event and session/mission view.
  No failed task becomes done and no failure/history disappears. Handoff histories
  explain recovered work; successful completion records only its existing summary/
  Leader/global sequence. Schemas5–6 keep their stricter all-done predicate.

Successful completion closes all admission, including new handoffs. Stop retains
existing behavior: queued successors cancel, uncertainty stays reserved, lineage
persists. A stopped session cannot accept a new handoff or successful completion.
No automatic mission finish, admission reopening, member promotion or reassignment.

## 5 Capacity, recovery and failure ordering

Keep1000 events and the existing active global terminal reserve. Accepted handoff
needs its event PLUS eight NEW assignment units. It cannot borrow closed predecessor,
other assignment/question or terminal reserves. Admission must validate the entire
post-event reservation inequality atomically before writes. Rejected traffic cannot
spend held units; retries spend nothing. No new lineage-only reserve is needed.
Stop/completion share the one active terminal event. Handoff admission at fewer
than nine free units refuses before writes; admitted successor terminal work still
fits its held units. Closure never resets10 handoffs or100 assignment history.

The ordinary interrupted-open write fence covers new handoffs; no new exemption.
Existing owner stop/recover/observeFailure exemptions remain narrow. Exact earlier
decisions precede the fence. Pending failure cannot be handed off until accepted
resolution closes it; resolving one task does not acknowledge other interrupted
work. Handoff never supplies a witness or answers a pending question. Open replays
only; fresh observer/exact retry after a lost reply sees one successor and one edge.

## 6 Required exit evidence

Parent actual-source review must pin SQL, events, DTO/hash/predicates/guards,
compiled output and measured runtime/native files before execution. Preserve all
158 tests and historical seals. Required real SQLite/public-boundary cases:

1. Exact schema7 and older-root refusal, schema1–6 regressions; closed wire/text/
   authority/identity grammar, wrong Leader/session/target, stale or missing failure,
   queued/live/uncertain/cancelled/done predecessor and prior-successor ID rejection.
2. Immediate known failure and explicitly reconciled failure each create one fresh
   queued successor, immutable title/lineage and matching assignment in one event;
   old histories untouched, no automatic invocation, same-member and Leader target.
3. FIFO with pre-existing queue, blocked/busy target and global cap; independent
   witness counts prove old effect not rearmed. Successor requires new plan/effect/
   attempt/approval/result; predecessor effect/attempt reuse rejects independently.
4. Leader/owner/from/target detached view filtering without private question/failure
   payload leakage; rejected/changed/exact shared-ledger retries and reopen stability.
5. One handoff per predecessor, ten lifetime handoffs across closed chains,100
   assignment ceiling and rejected fresh IDs; no cycle/branch or lifetime reset.
6. Schema7 recovered mission success for single/multi-step chains, mixed ordinary
   successful tasks; missing/failed/cancelled/pending successor and uncovered failed
   task refuse. Original failures remain failed; schemas5–6 still require all done.
7. Stop/recovery/failure order, fence and exact past decisions; no handoff after
   stop/completion, queued successor stop cancellation, one unresolved assignment
   still fences handoff even when its proposed predecessor is already closed.
8. Held capacity admission with eight versus nine available units; no phantom task/
   title/edge on refusal; admitted lifecycle and global terminal reserve survive
   rejection pressure; exact retries spend no additional units/events.
9. Actual SQLite projection-write abort, fresh fixed owned-host before/after handoff
   COMMIT crashes with fresh observer/redelivery, changed stored edge/title/sequence/
   assignment/task/session or event actor/result/hash refusal without repair.

Only existing fixed owned core/witness composition, reviewed role selection,
child10-second operation and5-second verified owned teardown; retain streams and
bounded420-second aggregate capture unless measured evidence justifies a documented
change. No live detector, automatic retry/takeover/succession, hostile in-process
isolation, whole-host/power-loss, throughput, Electron/WSL ABI, provider/terminal/
UI/network/MCP, worktree, migration or release qualification. Exit maps the logical
Architecture4.7/4.2 subset and ends this construction exception.

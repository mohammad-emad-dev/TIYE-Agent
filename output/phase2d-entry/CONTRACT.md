# Phase 2D: synthetic task-failure observation and reconciliation

Proposal only. Baseline1bbb391: Phase2C exit with139 passing tests. Target is the
internal logical response/notice subset of Architecture4.7, not a live supervisor.

## 1 Storage and boundaries

Reuse TaskStore and its synchronous single writer, command/event ledger, replay,
private-root validation and exclusive connection lease. Proposed explicit
`createFailureEngine(directory)` / `openFailureEngine(directory)` recognize fresh
schema6 only: exact schema5 tables plus STRICT `failures(id,value)` keyed by taskId.
Existing schema1–5 openers and operation semantics remain separate and unchanged.
No migration, import, repair, reset, downgrade, second writer or queue database.
Replay independently reconstructs failures/assignments/tasks/questions/effects and
compares projections on open. Drift refuses without persisted reconstruction.

Only the existing fixed owned host and independent witness composition may run,
after parent actual-source/test/compiled/runtime/native preflight. No arbitrary
executable, actor, member handle or raw store may be selected through member input.
Trusted coordinator roles do not authenticate hostile code in the same process.

## 2 Command and identity

Owner adds `observeFailure(bytes)`; members receive no failure-writing method.
DTO exactly `{type:"team.task.failure",version:1,commandId,sessionId,taskId,
memberId,attemptId,reason,summary}`. IDs follow existing lowercase UUID-v4; bytes
use compact canonical UTF-8 <=16KiB, closed fields, numeric version1 and existing
text bounds: summary1–256 Unicode scalars / <=1024 UTF-8 bytes, no lone surrogate
or normalization. Reason is exactly one of `crash`, `hang`, `rate_limit`, `auth`,
`network`. These are supplied synthetic categories, not verified detector output.
No timestamp, process identity, proof, desired outcome or caller actor is accepted.

Actor is the trusted owner literal `owner`. Hash is SHA-256 over UTF-8 JSON of
`["team.task.failure",1,"owner",commandId,sessionId,taskId,memberId,attemptId,reason,summary]`
without trailing newline. Shared command namespace; exact ID/hash retry returns
its original accepted/rejected decision before state, capacity or recovery fence.
Changed payload/type refuses without writes. Malformed input refuses before
admission. New semantic rejection consumes one unreserved event when available,
otherwise refuses without a decision; held units cannot pay for rejection.

One event `team.task.failure`, exact `{command,actor,result}` body. Replay derives
the decision/hash and every transition independently; one event cannot partially
commit notice, question cancellation, effect state or assignment closure.

Accept only a matching nonclosed STARTED assignment in the named session, with
the exact assigned member and sole effect attempt. Session may be active or
stopped, never completed. Queued/unassigned/unknown work and stale attempts reject.
At most one accepted failure per assignment lifetime, including closed history;
a new command for an already observed failure rejects. No separate failureId or
reusable failure budget. The existing100 lifetime assignments bound notices.

## 3 Logical failure response

Cancel any open question for this task only, retaining question text/route history,
setting its cancelled status and actual failure-event closing sequence, with no
answer and zero remaining question budget. Other tasks' questions remain untouched.
The same event must remove the blocked overlay; no closed question leaves blocked
work. Assignment/effect handling follows this table:

| Current assigned effect | Accepted failure response |
| --- | --- |
| planned, approved or unapproved | Cancel the unclaimed effect; close assignment and task failed; release its remaining assignment units |
| completed, cancelled or abandoned awaiting report | Keep effect outcome; close assignment and task failed; release remaining assignment units |
| dispatching, including recoveryAcknowledged | Move effect/task to needs_attention, bind attentionSequence to this event, retain assignment slot and remaining terminal budget |
| needs_attention | Keep existing attentionSequence and effect outcome; retain slot/budget and needs_attention task |

An accepted observation spends one existing assignment event unit before closure
or retention. It never borrows question units or the global terminal slot.
It never claims an effect, dispatches/terminates a process or records task done.
The stored member `assignment.result` remains null: a supervisor observation must
not fabricate a member report. The failure projection records cause and closure.

For a failure awaiting reconciliation, the existing `resolve` API remains the
sole accepted effect-outcome mutation. It requires the exact attention sequence
and existing witness predicate. Exactly one matching witness can confirm completed;
explicit close_uncertain can abandon. Either accepted resolution closes THIS
assignment/task failed, even in an active session, sets notice closure sequence,
and releases remaining assignment units in that same resolution transaction.
The effect remains completed or abandoned respectively; no task done inference,
resend, automatic result report or second attempt. Invalid/rejected resolution
cannot close the notice or release a slot. Existing unobserved work keeps its
earlier resolution/report semantics.

While a failure notice is awaiting reconciliation, fresh member reports reject,
including done prose or failed prose; raw approval/claim/cancel/settle mutations
refuse at API AND replay paths. True no-ops and rejected resolutions remain
available under existing semantics. Questions cannot be recreated for that task.
Closed assignments reject fresh reports/failure observations. Exact earlier
decisions stay unchanged. New accepted stop must not turn an already failed task
cancelled, replace attentionSequence or close uncertain work as though proved.

## 4 Notices, scope and continued work

Owner/member handles add `failures()` on schema6 only; older roots refuse rather
than returning empty support. Views return detached records with exactly
`{sessionId,taskId,memberId,attemptId,reason,summary,observedSequence,status,
closedSequence}`. Status is `awaiting_reconciliation` or `closed`; closedSequence
is null while pending, otherwise the actual observation/resolution event sequence.
No ledger material, raw witness data, question text or internal budget counters.
Owner sees all notices. Leader sees all; other members see their own only.
Closed history remains visible and counts toward the lifetime bound.

These observations are TASK-scoped. They neither revoke a member nor introduce a
global member-health projection. Once that assignment closes, existing FIFO/cap
rules may start another already queued task when the trusted scheduler explicitly
requests it. No automatic retry, reassignment or takeover occurs. One failed task
prevents Phase2C successful mission completion; logical owner stop remains available.
Leader-task failure follows the same task rules and is visible to owner; immutable
leadership/handles remain unchanged. Live member death, succession and user alerts
remain later behavior, not implied by this internal notice.

## 5 Capacity, stop and recovery

Keep the1000-event hard cap and eight-unit reservation per accepted assignment.
The failure observation consumes the existing spare assignment unit; no new
unreserved capacity is needed for an admitted assignment's accepted observation.
The implementation review must prove worst-case remaining lifecycle paths still
leave the observation and any necessary resolution funded. If an alleged state
cannot fund both, refuse before mutation; never release uncertainty to fit capacity.
Question cancellation releases only that question's unused held units. Immediate
failed closure releases assignment units once; pending notices keep them until
accepted resolution. A resolution event spends its existing unit then closes.
Rejected traffic cannot consume held units or the global active-session stop slot.
Stop uses the existing one global terminal event; no second failure/stop reserve.

The ordinary interrupted-open new-write fence remains. Explicit OWNER
observeFailure is an additional narrowly defined exempt command, alongside existing
owner stop/recover. It only acknowledges this assignment by the conservative failure
transition, never issues work. Other interrupted assignments still fence normal new
writes until their own recovery/stop/failure acknowledgement. Exact retries precede
the fence; normal new failure semantic rejections still need unreserved space.
Recover must not resolve pending failures, supply answers or resurrect work.
Observation after recovery is allowed for that sole matching attempt. Stop after
observation preserves uncertain notice/attention; resolution after stop closes failed.
Failure after stop may accept only still-nonclosed matching started work. Stop of
unclaimed work already closed it, so a later observation rejects. Completed missions
admit no new failure. Open replays notice/history only, without action or repair.

## 6 Required exit evidence

Parent must review actual SQL/events/guards, source/tests, compiled files, measured
runtime and installed native hashes BEFORE execution. Preserve all139 baseline
tests and historical seals. Add real SQLite/public-boundary cases for:

1. Exact schema6/openers, older-root refusal and schema1–5 regressions; owner-only
   writer, canonical grammar/reasons/bounds, wrong member/session/attempt, stale/
   queued/closed work, duplicate lifetime observation, shared-ledger conflicts/retries.
2. Every effect state in the table; atomic task-only question cancellation with
   another task blocked; no fabricated report/done; pending occupancy retains FIFO
   and global cap; unrelated work can progress and explicit later queue start works.
3. Independent witness0/1/duplicate/conflict/unavailable cases; exact attention
   binding, rejected resolution preserves slot; confirmed/abandoned pending failures
   close failed atomically without resend; API and injected replay bypass refusal.
4. Owner/Leader/own-member detached histories; no unrelated question/witness/budget
   data; Leader-task failure and absence of automatic promotion/takeover.
5. Open/recovery/failure/stop orderings, including multiple interrupted assignments,
   narrow owner-failure fence exemption, acknowledgement leaves other work fenced,
   stable old retries, mission success refusal and no automatic action on reopen.
6. Actual SQLite abort of observation and resolution projection writes plus fresh
   owned-host crashes before/after their COMMIT; fresh observer redelivery yields
   one notice/closure and stable witnesses, never a half-applied question transition.
7. Worst-case lifecycle budgets and full-cap pressure: accepted observation and
   terminal resolution remain funded; rejected traffic cannot steal held units,
   exact retries spend nothing; released budgets/closed lifetime stay closed on open.
8. Stored notice cause/status/sequence/identity, attention/task/question/assignment
   projection, event actor/result and command-hash tampering refuse open without repair.

Only existing fixed owned core/witness composition, reviewed coordinator binding,
child10-second operation and5-second verified owned teardown. Retain streams and
bounded420-second whole-suite capture unless measured aggregate evidence justifies
a documented change. No whole-host/power-loss, hostile same-process isolation,
throughput, Electron/WSL ABI, live detector/nudge, native provider, terminal/UI/MCP,
worktree, migration, Leader succession or release qualification follows. Exit maps
implemented/deferred Architecture4.7 behavior and ends this construction exception.

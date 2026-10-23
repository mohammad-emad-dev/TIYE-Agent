# Reviewed execution plan: assigned synthetic lifecycle

23 October 2026. Existing Phase 2A owner approval remains applicable. The parent
reviewed actual engine lifecycle/stop reducers, store/replay integration, fixed
host changes and all new/changed tests before first execution. The source-bound
preflight captures this plan, package/root/architecture sources, compiled files,
pinned Node 26.7.0 Windows x64 and installed native/dependency hashes.

## Exact composition and decisions

Use only the existing fixed core host, independent mock witness, private-root
allocator and owned-process helpers. No new executable/runner, provider/native
CLI, terminal, credentials, project action or network capability is introduced.
The witness writes every invocation without deduplication; the coordinator
observes only after the synchronous writer exits. One exact matching row is
proof; zero/multiple/conflicting/unavailable evidence becomes attention. The
library never launches or queries a witness itself.

Report DTO exactly `{type:"team.task.report",version:1,commandId,sessionId,taskId,
status,summary}`. Bound matching member actor; status done/failed, existing valid
text bounds (1-256 scalars, <=1024 UTF-8 bytes, no lone surrogate). Hash ordered
array `["team.task.report",1,actor,commandId,sessionId,taskId,status,summary]`.
Recovery DTO exactly `{type:"team.session.recover",version:1,commandId,sessionId}`;
owner-bound hash `["team.session.recover",1,"owner",commandId,sessionId]`.
Canonical compact UTF-8 JSON <=16 KiB and exact fields apply to both. Hashes use
SHA-256 UTF-8 JSON without BOM/newline. Event body exactly `{command,actor,result}`;
replay independently derives each decision, command hash and task/assignment view.

Report only nonclosed started matching assignments; done requires completed
effect plus active session, failed requires completed/cancelled/abandoned effect.
Acceptance stores summary/status and closes reservation/remaining budget in the
same event transaction. Completion proof alone leaves running/reserved; uncertain
or dispatching work cannot close through report. Active explicit resolution
preserves the reservation until report. Stop of dispatched work records attention,
preserves occupancy and binds the actual stop sequence; existing attention is not
rebound. Resolution after stop closes cancelled on confirmed completion or failed
on abandonment, never done. Already terminal effects awaiting report can receive
failed reporting after stop. Planned/queued work still cancels atomically on stop.

Open reconstructs only. It captures unrecovered dispatching assignments in a
connection-local fence; new appends except owner stop/recover refuse until their
phase is acknowledged. Existing ledger retries/read/no-op calls remain available.
Exclusive SQLite lifetime ownership prevents a concurrent/stale owner. Recovery
marks each newly interrupted sole attempt acknowledged and reconciling; repeating
the same phase cannot consume another assignment unit. No witness call, start,
new attempt or resend follows open/recover. A plan with no committed claim can
receive its first approved claim while its session remains active.

Capacity formula remains event count + assignment remaining budgets + unassigned
legacy reserves + active-session stop slot <=1,000. Enqueue holds8; start, approval,
claim, recovery, settlement, resolution and report each spend1; spare1 remains.
Composite recovery spends1 per affected assignment in one transaction. Stop uses
global1, not assignment budgets. Terminal closure releases leftovers. Rejected,
no-op and lost-reply traffic cannot spend/recreate held units. Every assignment,
including closed history, counts toward lifetime100. No unlimited crash retention.

## Checks and review limits

Retain the prior 77-test suite. Replace the obsolete assigned-dispatch HOLD test
with a stronger assertion that approval AND witnessed completion retain the global
slot until matching report; old schema1/2 regressions remain unchanged. Add21 tests:

- Done summary persistence, FIFO release only on report, idempotent result retry,
  changed summary/cross-type conflicts, matching-member authority and wire bounds.
- Uncertain member stays reserved while another member completes; stale attention
  refuses; abandonment requires failed report; duplicate witness rows remain uncertain.
- Reopen fence covers new task/start/report, raw cancel/settle and an unrelated
  approved first claim; exact retries remain available. Recovery acknowledges a
  phase once, stays deterministic across another reopen and never resends.
- Multi-member recovery and reporting rollback via actual SQLite TEMP trigger
  abort at projection writes, with SDK hook restored in finally.
- Planned first claim after reopen, stop of dispatched work with both resolution
  outcomes, retained original attention, terminal failed reporting after stop,
  active cancellation and real already-expired plan handling.
- Valid rejection history fills all unreserved capacity. Claim/recovery/settlement/
  resolution/report/stop still commit from held budgets; repeated recovery cannot
  spend terminal budget. Previous event1,000 stop case remains retained.
- Stored report actor/summary, recovery decision and task projection tamper refuse
  reopen without repair/reset.
- Eight fresh host crashes around actual before/after COMMIT for report, recovery,
  claim and dispatched stop. Reopen checks all-or-none state; independent witness
  remains exactly1 row, or0 for lost claim replies where no action was issued.

Children retain10-second operation bounds plus5-second verified owned-handle
teardown. No PID adoption or generic executable selector is added. Build, source
import boundary and full real SQLite/process suite run through `capture.py`;
changed sources require new review/preflight. Raw captures stay under `.git`;
publish only summarized outcomes and digests sealed from actual retained TAP.

Model design input is not a source audit. clean-code-guard/test-guard/docs-guard
apply to actual changed source/tests/docs. Full-history replay/projection rewriting
is bounded and remains unqualified for throughput. Full host/power loss, hostile
same-user mutation, Electron/WSL ABI, authenticated callers, real provider work,
UI, questions, takeover, file ownership and release remain outside this component.
Full Phase 2A exit review is still required; passing this suite does not close any
native/provider admission gate.

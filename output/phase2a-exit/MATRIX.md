# Requirements and Architecture 4 traceability

25 October 2026. Approved target: `team-engine-entry/CONTRACT.md`, frozen at8f2d0a2
and activated at4ce785d. Current production baseline:93f417d. The final measured
run and verdict are bound by verification.json, decision.json and evidence.json.

## Contract acceptance matrix

| Requirement or risk | Required observable behavior | Evidence in packages/core/test | Review result |
| --- | --- | --- | --- |
| Session and identity | One immutable bounded roster, exactly one leader, exact schema opener, bound handles; invalid actor/wire refuses | session.test.cjs; inbox.test.cjs; engine-lifecycle.test.cjs | Covered by source and suite |
| Durable commands | Shared namespace; original result survives reopen; changed hash refuses before writes; semantic rejections persist | session/inbox/registry/resolution/engine-lifecycle tests | Covered by source and suite |
| FIFO and occupancy | Only queue head starts; approval and effect completion retain the slot until report; unrelated eligible member progresses | inbox.test.cjs; engine-lifecycle.test.cjs | Covered by source and suite |
| Atomic start | Plan and reservation commit together; rollback/lost reply cannot create phantom or duplicate work | inbox.test.cjs SQLite abort and before/after COMMIT hosts | Covered by source and suite |
| Outcome versus result | Exactly one matching independent row may complete an effect; task remains running/reserved until matching-member done report | effects/resolution/engine-lifecycle tests; inbox completed-effect cap test | Covered by source and suite |
| Uncertainty | Missing/duplicate/conflicting/unavailable proof pauses only affected work; abandonment cannot become done | effects.test.cjs; engine-lifecycle.test.cjs | Covered by source and suite |
| Recovery and no resend | Open performs no action, new writes are fenced until explicit acknowledgement; sole recovery phase spends once; claim never returns twice | engine-lifecycle.test.cjs; effects/registry/resolution crash cases | Covered by source and suite |
| Stop and bypasses | Queued/planned work cancels; dispatched uncertainty stays reserved; core claim paths and scheduler cannot revive stopped work | engine-stop.test.cjs; engine-lifecycle.test.cjs; new mixed-stop exit test | Covered, including one mixed transaction |
| Lifetime limit | Closed history still counts; free occupancy cannot admit assignment101 | new engine-exit.test.cjs 100 sequential closed assignments and reopen | Direct boundary check added |
| Event budgets | Accepted lifecycle work spends held units, rejected/no-op traffic cannot; admitted terminal work fits; stop may commit as event1000 | session/inbox/engine-stop/engine-lifecycle capacity tests | Covered by independent counts and source formula |
| Tamper/error handling | Replay refuses altered authority/hash/decision/state; SQLite abort leaves original event/command/projection and reservations | store/session/inbox/engine-stop/engine-lifecycle tests | Covered by real SQLite, not fake stores |
| Commit crash recovery | Fresh owned hosts inspect all-or-none state across session/enqueue/start/report/claim/recovery/stop commits; independent witness counts unchanged | crash/effects/registry/resolution/session/inbox/engine-stop/engine-lifecycle tests | Covered within controlled child-crash boundary |
| Ownership and compatibility | Idle lifetime lease excludes a rival; schema1/2 regressions persist; fresh schema3 only, no migration/reset | store/effects/session tests; unchanged production source | Covered on pinned Windows runtime |

The verdict does not rely on test-count percentage, a model vote or historical
green output alone. Fresh execution must pass the entire mapped suite with no
failed/cancelled/skipped tests and source/compiled/runtime/native seals intact.

## Architecture 4 behavior mapping

| Architecture area | Implemented within Phase2A | Deferred product behavior |
| --- | --- | --- |
| 4.1 Components | Synchronous session/role/FIFO/reservation logic over one event store | Process service, team tools server, approval broker UI, automatic failure/context/file supervisors |
| 4.2 Team tools | Internal bound enqueue/report/context/inbox/status primitives | Authenticated MCP tools/bridge, file assignment, merge request, questions, complete mission; no published tool protocol |
| 4.3 Task state machine | queued, waiting_approval, running, reconciling, needs_attention, explicit done/failed/cancelled views | blocked questions, process stopping orchestration, automatic timeout failure/takeover, retries/reassignment |
| 4.4 Inboxes/scheduling | Durable FIFO, one reservation/member, global cap; explicit serialized scheduler starts | Automatic worker delivery, live CLI/API concurrency, feed indicators |
| 4.5 Questions | None | Member/leader/user question queues, answer cards and resume transitions |
| 4.6 Stop | Durable admission closure, planned cancellation and uncertainty-preserving reconciliation | Terminal interrupt, process-tree termination/verification, API abort and product resume messaging |
| 4.7 Failure supervisor | Explicit conservative interrupted-attempt recovery and attention resolution | Live crash/hang/rate-limit/auth/network detection, nudges, user alerts, takeover and leader succession |
| 4.8 Context management | Immutable bounded member instruction text | Transcript selection, context accounting, automatic summarization and CLI usage display |
| 4.9 Briefing | Bound roster/name/role/instructions/session snapshot | Full skills/permissions/files/worktree/language briefing and transport to providers/CLIs |
| 4.10 Direct terminal input | None | Terminal delivery, audit events, feed display and leader notification |
| 4.11 Review indicator | None | Review-return events and optional UI counter |

## Engineering review limits

The single synchronous writer and exclusive lease prevent rival/stale ownership
within the tested environment. Role handles constrain trusted internal callers;
they do not authenticate hostile code executing in the coordinator. Witness proof
is trusted fixture input observed after writer exit, not externally authenticated
provider evidence. Repeated recovery of a sole acknowledged attempt cannot resend
or spend terminal budget again. The conservative same-connection recovery call is
documented and does not establish that a process crashed.

Existing full-history replay and bounded projection replacement remain a
maintainability/performance limitation; this review makes no throughput or UI-scale
claim. Whole-host/power loss, hostile same-user database substitution, Electron/WSL
ABI, arbitrary process containment and unbounded retention remain unqualified.
These are outside the approved slice, not hidden passes for the complete engine.

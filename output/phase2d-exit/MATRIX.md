# Phase 2D contract traceability

27 October 2026. Contract frozen atf4ef14f; delegated scope decision and production
implementation233e723. The execution plan was prepared26 October; this exit decision
records completion27 October in Asia/Amman. Acceptance is the bounded internal slice.

| Contract section6 requirement | Real evidence and source boundary | Result |
| --- | --- | --- |
| 1 Identity/grammar/compatibility | FailureEngine schema6/openers, owner-only observeFailure, closed canonical codec/hash; failures root and command tests retain all139 baseline cases | Covered |
| 2 Logical transition table and occupancy | failureDecision requires matching started effectId/member/attempt and one lifetime record; effect-state loop, task-only question cancellation, FIFO/cap and unrelated explicit progress tests | Covered |
| 3 Reconciliation and bypasses | Existing witness predicate, exact attention binding and effects-model failure closure; zero/one/duplicate/conflicting/unavailable proof cases, report/API state guards and injected replay cases | Covered |
| 4 Visible history | Scalar detached FailureNotice fields and owner/Leader/own-member filtering; three-member fixture and Leader failure without promotion | Covered |
| 5 Open/recovery/stop ordering | Ledger-first retry, narrowly exempt owner observation, other interrupted work remains fenced; recovery preserves notices; new exit integration covers BOTH stop orders and confirmed/abandoned resolution after stop | Covered |
| 6 Atomicity and crashes | Real SQLite failures projection aborts for observation/resolution; four fixed owned-host before/after COMMIT variants and fresh observer retry | Covered within controlled child boundary |
| 7 Budget and lifetime | Eight-unit assignment reserve; pending observation needs2 units before spending1; worst-case recovery/settlement history leaves3, rejection pressure cannot steal units, observation and resolution remain funded; closed history/retries remain stable | Covered |
| 8 Projection/event tamper | Actual SQLite edits to notice identity/cause/status/sequences, command hash, task projection and event actor/result refuse open; authoritative event replay also derives attention/assignment/question state and validates stored projections | Covered within unsigned-history boundary |

Assignments and attention sequences are derived replay views, not independent
materialized tables. Their identity and budget checks are exercised through event
transitions and public snapshots, not invented projection-write fixtures. Existing
question-projection drift checks remain retained. Consistent whole-database
substitution/rollback and hostile same-user mutation remain outside qualification.

The exit integration independently reads actual SQLite events after writer close.
Each notice's observedSequence/closedSequence equals the stored observation/
resolution sequence. Resolving one task leaves the other's slot held. Both tasks
close failed with null member results; effects remain respectively completed and
abandoned. Reopen/exact retries append nothing and independent witness counts stay1/0.

## Architecture4.7 implemented and deferred

| Area | Implemented in this slice | Deferred product behavior |
| --- | --- | --- |
| Failure input | Explicit trusted-owner task observation with bounded crash/hang/rate_limit/auth/network categories | Live exit/connection/output/provider detectors; authenticated transport |
| Logical response | Known/unclaimed outcomes close failed; uncertainty stays reserved; task-only question cancellation; no fabricated member result | Process interrupt/termination and proof of OS death |
| Leader notice | Durable owner/Leader history and own-member filtered query | Push notification, user alert, feed/UI cards |
| Reconciliation before takeover | Explicit existing witness confirmation or abandonment closes failed without resend | Automatic takeover, retry or reassignment and partial-work handoff |
| Hang/network handling | Supplied reason only; conservative state transition | Timers, automatic nudge, brief network retry policy |
| Leader failure | Same task rule with owner visibility; immutable Leader preserved | Succession order, promotion, handover and return-of-leadership decision |

Other Architecture4 areas retain the prior
[Phase2C mapping](../phase2c-exit/MATRIX.md). In particular UI/MCP, automatic worker
delivery, context management, provider briefing/transport and terminals remain
deferred. This is not complete-engine or complete-product acceptance.

Fresh schema6 only, separate schemas1–5 without migration/reset. One synchronous
writer, fixed synthetic witnesses and trusted in-process roles define this review.
No throughput, whole-host/power-loss, hostile-code isolation or Electron/WSL ABI
claim follows. Integration and release remain HOLD; this exit grants no new scope.

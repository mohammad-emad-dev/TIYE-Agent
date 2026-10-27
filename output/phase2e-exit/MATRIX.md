# Phase 2E exit traceability

27 October 2026. Target: contractc84c709; delegated owner decision and production
implementation48c0c4c. Production source is unchanged. This accepts the internal
synthetic handoff and recovered-mission subset, not the complete product.

| Contract section6 requirement | Actual source and real SQLite/public-boundary evidence | Result |
| --- | --- | --- |
| 1 Root/role/grammar/identity | Schema7 exact factories/table definitions; Leader-bound member handoff; canonical codec/hash; all schema1–6 regressions and ineligible predecessor cases retained | Covered |
| 2 Atomic creation and history | reduceHandoff creates task/assignment/eight units/edge/decision in one event; immutable predecessor snapshots and registry title/reopen tests; known and explicitly reconciled failures | Covered |
| 3 FIFO/concurrency/new approval | Handoff queues at target tail; busy target/pre-existing queue tests; scheduler/global cap and normal approval; old effect/attempt reuse refuses; independent witness counts | Covered |
| 4 Query privacy and retries | Exact detached lineage fields and owner/Leader/from/target filtering; restricted questions/failures stay restricted; shared ledger rejects changed actor/payload/type and returns old decisions | Covered |
| 5 Lifetime/acyclic history | One outgoing edge per predecessor and fresh successor prevents branches/cycles;10 handoff closed-history limit,100 assignment boundary including successor100 and refusal101 | Covered |
| 6 Recovered mission | Iterative path walk over every accepted root task; mixed ordinary/single/multi-step success, incomplete/uncovered/cancelled/live work refusal; schemas5–6 strict rule remains; new maximum-ten-chain success | Covered |
| 7 Stop/recovery/admission closure | Handoff gets no recovery exemption; unresolved other work fences it, old retries remain; stop cancels queued successor/preserves edge; completed sessions close new admission | Covered |
| 8 Reservation capacity | Post-event inequality accounts for one handoff event plus8 new units and existing terminal reserve;8 free refuses without phantom state,9 admits; lifecycle and recovered completion at event1000 | Covered |
| 9 Abort/crash/tamper | Actual SQLite handoffs projection abort; four before/after handoff/recovered-completion COMMIT variants with fresh observers; event/ledger/task/edge/title/sequence/cycle tamper and injected accepted eligibility bypass refuse open | Covered within controlled child boundary |

The exit case independently reads stored SQLite events after writer close. Every
handoff sequence equals its successor assignment's enqueue sequence and actual
event ordinal; accepted title/Leader/result match immutable event data. No fabricated
task.create event exists for successor tasks. Ten failed predecessors stay failed,
the terminal task stays done and the completion sequence matches its actual event.
Reopen and ten exact retries append nothing; independent terminal witness stays1.

Assignments/attention are event-derived views, not independent stored tables.
Projection comparison and replay validate their identities and budgets through the
same event stream. No signed-history or hostile whole-database substitution claim.

## Architecture mapping

| Area | Implemented internal behavior | Deferred product behavior |
| --- | --- | --- |
| 4.2 Delegation/reporting/completion | Leader-directed new queued successor with lineage; explicit result; mission success through fully successful recovery chains | Authenticated MCP/CLI tools, user feed and provider delivery |
| 4.3 Task state | Failed predecessors immutable; successor has its own lifecycle; no automatic done/claim/retry | Automatic timeout recovery and process stopping orchestration |
| 4.4 Inboxes | Existing FIFO/member/global limits include handoff successors;8 held units per new assignment | Automatic worker delivery and live provider concurrency |
| 4.7 Failure handoff | Explicit handoff only after closed observed failure; uncertainty reconciles/explicitly closes first; failure history retained | Live detector/nudge, automatic takeover/reassignment, Leader promotion/succession and handover transport |

Other areas retain the previous
[Phase2D mapping](../phase2d-exit/MATRIX.md), including deferred context management,
full provider briefing, terminals, files/worktrees/merge, UI and release. Explicit
handoff is an owner-authorized internal construction feature, not autonomous execution.
Semantic duplication across different explicitly approved effects is not deduplicated.

Fresh schema7 only; no migration/reset. Trusted in-process roles, one synchronous
writer, fixed synthetic witness and controlled owned-child crashes define the
qualified environment. Full-history replay/projection replacement has no throughput
qualification. Whole-host/power-loss, hostile-code isolation and Electron/WSL ABI
remain outside scope. Provider/native integration and release remain HOLD. This
exit ends Phase2E construction permission and grants no new capability scope.

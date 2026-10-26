# Phase 2C contract and Architecture 4 coverage

26 October 2026. Target is CONTRACT.md frozen at58187f8 and explicitly approved
at144ebbc. Acceptance is the internal schema5 synthetic completion contract only.

| Contract section5 requirement | Implementation and real evidence | Result |
| --- | --- | --- |
| 1 Compatibility and command authority | Exact schema5 metadata/openers, schema4 SQL retained; member-bound completeMission and mission-root guard; missions grammar/root tests plus all prior schema1–4 cases | Covered |
| 2 Explicit successful completion | engine-mission validates all task/assignment/effect identities and results; Leader needs no task; missions success case compares histories, exact detached view, actual global sequence and independent witness counts | Covered |
| 3 Premature work blocks success | missionDecision checks every task state, closed done result, matching completed effect and zero assignment/question budgets; thirteen premature variants cover empty/queued/approval/blocked/dispatched/reconciling/attention/completed-awaiting-report/failed/cancelled/unassigned/legacy | Covered |
| 4 Terminal closure and retries | effects-model rejects fresh task/create/raw plans and effect mutations; existing inbox/question/lifecycle predicates require active session; injected raw replay events refuse; new mission-exit case covers fresh start/escalation/replies/resolution and exact old decisions after reopen | Covered |
| 5 SQLite and commit atomicity | Real TEMP projection-write abort rolls back snapshot/ledger/event; fixed owned hosts crash before/after actual completion COMMIT, fresh host retry creates one decision, independent witness count remains1 | Covered within controlled child boundary |
| 6 Capacity, recovery and stop | One active terminal reserve, no second completion reserve; completion at actual event1000 with rejected pressure and stable retry; interrupted-open fence and stop/completion order tested explicitly | Covered |
| 7 Tamper refusal | Actual SQLite edits to completion summary/actor/sequence/status, command hash and event result refuse open; no repair/reset path | Covered |

The new integration case uses two assignments and both owner-directed question
origins, including member-to-Leader escalation. Successful completion preserves
answered history and all task/effect/assignment values. Post-completion rejection
events may grow the ledger, while exact old retries append nothing and witnesses
remain single-invocation. No test count is used as a product-completion percentage.

| Architecture area | Implemented internal behavior | Still deferred |
| --- | --- | --- |
| 4.1 Components | One SQLite writer and deterministic synthetic orchestration | Process service, live supervisors and broker UI |
| 4.2 Team tools | Bound enqueue/report/questions/status and explicit successful mission completion | Authenticated MCP/CLI bridge, files/merge tools and user delivery |
| 4.3 State machine | Prior task states plus terminal completed mission; no automatic completion from prose | Reassignment, retries, process stopping orchestration |
| 4.4 Scheduling | Durable FIFO/reservations/global cap; completed mission closes admission | Automatic worker delivery and real-provider concurrency |
| 4.5 Questions | Durable routes, single-hop escalation, answers and history survive mission completion | UI cards, notifications and automatic delivery |
| 4.6 Stop | Existing logical stop and successful completion are mutually exclusive | Terminal interrupt/process-tree termination/API abort |
| 4.7 Failure supervisor | Explicit conservative recovery/reconciliation cannot imply success | Live failure detection, takeover and Leader succession |
| 4.8 Context | Immutable bounded instructions and question/summary text as data | Token accounting, transcript selection and summarization |
| 4.9 Briefing | Immutable roster/role context | Full permissions/files/worktree briefing and provider transport |
| 4.10 Terminal input | None | Direct-input audit, feed and Leader notice |
| 4.11 Review indicator | None | Review-return events and optional UI counter |

Success-only completion intentionally refuses any failed/cancelled or unassigned
work. Such a session may stop; no success override or retry/reassignment is implied.
Fresh schema5 only; schemas1–4 remain separate, without migration. Trusted roles
are not hostile-code authentication. Full-history replay and projection replacement
remain bounded but have no throughput qualification. Whole-host/power-loss,
Electron/WSL ABI, provider transport, UI and release remain unqualified.

# Phase 2B contract and Architecture 4 mapping

26 October 2026. Target is CONTRACT.md frozen at2766d76, activated at e62cea3.
Implementation acceptance is bounded to fresh schema4 and synthetic trusted roles.

| Contract section6 requirement | Source boundary and real evidence | Result |
| --- | --- | --- |
| 1 Eligibility, wire and privacy | engine-question codec/askEligible/visibleQuestions; questions.test.cjs exact roots, wire identity, ineligible asks and detached role views | Covered |
| 2 Recipient authority | questionDecision and bound store handles; direct Leader question and one-time escalation without Leader task, wrong/old-recipient rejections | Covered |
| 3 States and bypasses | restoreQuestionTask, API guardQuestion, replay guards and lifecycle blocked predicate; three pre-question states, expired plan, raw injected events, independent witness0/1 counts | Covered |
| 4 FIFO and global cap | Existing reservation logic retains assignment while blocked; unrelated member completes, queue head waits and raw plan refuses | Covered |
| 5 Composite stop | Replay validates stop then cancels questions before reduceStop; mixed planned/completed/queued/dispatched test binds same closing sequence and retains uncertainty | Covered |
| 6 Reopen and recovery | Connection-local fence applies all new question commands including owner answer; recovery test preserves question/route/budget and requires explicit answer without resend | Covered |
| 7 Atomicity and crashes | Actual SQLite projection trigger aborts for ask/escalate/answer/stop; eight before/after COMMIT owned-child variants with fresh observers and witness counts | Covered within controlled child boundary |
| 8 Capacity and lifetimes | Separate question reserve in reservedEvents/append; pressure preserves escalation/answer/stop,20 historical questions and one per assignment; question-exit.test.cjs independently verifies schema4 stop event1000 and exact retry | Covered |
| 9 Tamper rejection | Replay compares all projections; actor/route/answer/budget/task tamper cases; new question ledger hash corruption refuses reopen and leaves corrupted value unchanged | Covered |

The suite retains all100 pre-Phase2B cases and23 component cases, adding two exit
checks. Counts are execution facts, not a percentage of product completion.

| Architecture4 area | Implemented behavior | Deferred behavior |
| --- | --- | --- |
| 4.1 Components | One synchronous SQLite writer with event-derived synthetic roles, tasks and questions | Process service, automatic supervisors, broker UI |
| 4.2 Team tools | Internal ask/escalate/answer/filtered history plus prior enqueue/report/status | Authenticated MCP/CLI bridge, files, merge and complete-mission tools |
| 4.3 Task state | blocked overlay retains reservation; explicit answer restores waiting_approval/running; stop removes overlay without inferring done | Automatic retries, reassignment, timeout takeover |
| 4.4 Scheduling | Durable FIFO, one active/member and configured global cap survive blocked questions | Automatic worker delivery and live provider concurrency |
| 4.5 Questions | Durable member-to-Leader and Leader-to-owner routes, single-hop escalation, current-recipient answer, replay and20 lifetime ceiling | Answer cards, notifications, authenticated human transport and automatic delivery/resume |
| 4.6 Stop | Atomic question cancellation and conservative existing logical stop | Terminal interrupt/process-tree termination/API abort |
| 4.7 Failure supervisor | Prior explicit recovery and reconciliation leave questions unchanged | Live hang/auth/rate-limit detection and Leader succession |
| 4.8 Context | Bounded immutable instructions and question text as data | Transcript selection, token accounting and summarization |
| 4.9 Briefing | Immutable roster/roles/instructions | Full permissions/files/worktree briefing and provider delivery |
| 4.10 Terminal input | None | Direct input audit/feed/Leader notification |
| 4.11 Review indicator | None | Review-return events and UI counter |

The implementation does not authenticate hostile code sharing its process. Full
history replay/projection replacement remains bounded but has no throughput
qualification. Schema1–3 compatibility is retained with separate exact openers;
schema4 has no migration/reset/repair. Independent witness data comes from the
fixed synthetic observer. Whole-host/power-loss and Electron/WSL ABI are unqualified.
Provider/native integration and release remain HOLD. This exit grants no new scope.

# Phase 2C exit review execution plan

26 October 2026. Approved contract58187f8, approval and implementation144ebbc.
Parent reviewed actual engine-mission predicate/codec/reducer/view, schema5 factory,
ledger-first store admission, raw task/plan closure and effect replay guards,
question/lifecycle/stop predicates, recovery fence and terminal-reserve formula.
Production code is unchanged. Package documentation now links the accepted Phase2B
exit rather than its historical pending review.

Retain all138 tests and add one integrated real SQLite/public-boundary scenario:
member question escalates to owner, Leader question routes directly to owner,
both receive explicit answers, fixed witness effects complete and members report.
Leader explicitly completes the mission. Fresh scheduler starts, replies, escalation
and resolution reject without changing task/effect/question/session state; exact
past start/ask/escalate/answer/report/completion retries remain stable after reopen.
Detached question history remains available; each independent witness count stays1.

The existing frozen composition is unchanged: fixed owned mock host/witness only,
no executable/actor chosen by wire data. Actual SQLite aborts and before/after COMMIT
crashes, event1000 capacity, root refusal, malformed input, premature completion,
tampering and recovery remain covered by the full suite. Child operation10 seconds
and verified owned teardown5 seconds remain; aggregate capture420 seconds with
retained streams, build/import checks60 seconds. Build before measuring compiled
bytes. Source/test/runtime/native preflight precedes test execution; counts come
only from retained TAP matching its stdout digest. Changed tests require new review
and preflight. No model claim substitutes for actual tests.

No migration/repair, hostile in-process isolation, whole-host/power-loss, throughput,
Electron/WSL ABI, provider/terminal/network/MCP/UI or product release is qualified.

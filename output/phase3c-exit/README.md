# Phase 3C exit review

The approved fixed offline report_result contract passes its bounded exit review.
Production bytes remain unchanged from 1bf5731. Four additional real-core tests
cover actual core-stop transaction rollback and lost COMMIT reply before/after
report submission. The loop always fences, while session state reflects actual
storage: active after rollback, stopped after committed stop with lost reply.
An accepted report stays accepted; a stop before submission consumes no report
attempt and cannot fabricate a receipt or permit continuation.

Parent review traced canonical frame/history validation, explicit reporting
factory admission, immutable member/task binding, private command reservation,
the narrow member.report capture, receipt verification and uncertainty. Existing
346 tests include proof rejection, real report-write failures, post-commit timing
overrun, exact continuation receipts, isolation, stale callbacks and replay.
The exit suite adds four stop-failure cases and retains all prior test bodies.

Architecture mapping remains partial: 4.2 has bound context and report_result
subsets; 5.1 has a fixed offline lifecycle; 5.3 has a bounded in-memory loop.
Real providers/formats/SDK/HTTPS/credentials, full team tools, durable conversation
recovery, task dispatch through the loop, file/command tools, UI, packaging and
release remain unfinished. JavaScript cannot preempt the synchronous SQLite call;
the overrun case expects uncertainty after return, not a passing operation time.

This ends only the Phase3C construction exception. It authorizes no new scope.
The full product is not complete or release-qualified. decision.json records the
bounded acceptance; verification.json and evidence.json seal actual results.
Raw captures remain local under .git. Run the following from the repository root:

`rtk proxy python -X utf8 -B output/phase3c-exit/verify.py`

# Phase 3G source review and execution plan

7 November 2026. Scope: INTERNAL_PHASE3G_LEADER_HANDOFF, admitted against
the frozen proposal at 6639d5e by output/phase3g-approval/approval.json.

Parent reviewed the complete new handoff codec/bridge, protocol/fixed script,
adapter and controller changes, boundary checkers and all 43 real-core tests.
No core/mock-team production or existing test body changes are admitted. Native
execution uses only existing owned schema7/witness fixtures on Node26.7.0,
Windows x64, ABI147 and the previously qualified native dependencies. There is
no new executable composition, arbitrary adapter, provider or credential access.

The finite matrix has 43 new tests: Leader handoff of an eligible failed task
with actual continuation receipt (2 modes); non-Leader/foreign binding refusal
(1); catalog injection/duplication/overflow/roster-drift refusal (1); old
profile refusal (1); already-handed exact rejection (1); double-handoff
lineage preservation (1); successor-identity/title grammar bounds (1);
malformed/mixed/duplicate/unclosed/forged calls (9); tools after rejected
handoff (1); accepted/read/prose boundaries (3); real SQLite abort/lost
acknowledgement of accepted/rejected commands (4); stop barriers (3); actual
stop abort/lost replies (2); real post-COMMIT overrun (1); failed continuations
(3); closed store (1); independent closure/late callback (1); observer stop
(1); created-continuation stop (1); capacity refusal (1); rejected foreign
core stop (1); final-check failure (1); finished-notification stop (1); lost
acknowledgement with no retry (1).

Eligible-then-ineligible states are covered by interposed actual handoffs
(accepted predecessor becomes already-handed; second command rejects exactly)
rather than by reopening closed failures, which the core never permits.
Unknown member references cannot pass codec catalog validation; the bridge
selector check additionally refuses any catalog-external reference before any
core operation. Queued, running, blocked, uncertain, done, cancelled and
unobserved predecessors are ineligible at construction by the replay-checked
eligibility gate (failed state, closed notice, no handoff edge, no open
question); the construction gate itself is covered by the catalog-refusal
tests and the exact-rejection tests above.

Controller checks: initial dispatch (1), optional read admission (1), optional
read continuation dispatch (1), handoff admission (1), receipt continuation
dispatch (1), final acceptance (1): at most six, within eight. Read-only/direct
paths consume fewer. Handoff itself uses no projection read; the bridge's
measured core operations have their own 10-second elapsed checks; they do not
grant new loop checks. Only one conversation, three requests and two tools; one
optional read and one final handoff. Keep 8 messages/32 KiB including trusted
catalog, 64 KiB received, 64 retained events and 16 subscribers.

capture.py seals actual source/tests, compiled files, exact approval, test plan,
runtime and native dependencies before first changed-composition execution.
Three builds and four boundary checks have 60 seconds each. The focused 43-test
file has 240 seconds, followed by the full retained-plus-new 550-test suite at
the existing 1,320-second limit. Total sequential ceiling is 1,980 seconds.
Request/read/write elapsed limit stays 10 seconds and cleanup stays 5 seconds.
Run each stage once; on failure preserve incremental raw streams under .git,
diagnose, record the correction and new preflight before rerunning. No silent
retry, hidden deadline extension, disabled case or cleared uncertainty.

All 507 prior cases remain. This is implementation qualification only; separate
exit review remains required. Native/provider integration and release stay HOLD.

The first focused attempt passed 15/43 and stopped before the aggregate suite.
FAILED-ATTEMPTS.json seals its diagnostics. Parent corrected the bridge's
rejected-receipt pre-validation (the receipt codec admits exactly seven fields
and carries no title; the spread of title-bearing args violated exact-fields),
the binding test's over-strict refusal matcher, one grammar case that used an
accepted codepoint, one miscopied capacity-fill statement and two assignment
counts copied from the coordination profile. These are reviewed bridge/test
corrections; no core production fix or deadline extension.

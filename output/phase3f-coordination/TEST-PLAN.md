# Phase 3F source review and execution plan

27 October 2026. Scope: INTERNAL_PHASE3F_LEADER_COORDINATION, admitted against
the frozen proposal at 8fef7ae by output/phase3f-approval/approval.json.

Parent reviewed the complete new coordination codec/bridge, protocol/fixed script,
adapter and controller changes, boundary checkers and all 51 real-core tests.
No core/mock-team production or existing test body changes are admitted. Native
execution uses only existing owned schema7/witness fixtures on Node26.7.0,
Windows x64, ABI147 and the previously qualified native dependencies. There is
no new executable composition, arbitrary adapter, provider or credential access.

The finite matrix has 51 new tests: direct/status/context delegation (3), status
for empty/queued/running/blocked/uncertain/done/failed work (7), busy/FIFO (1),
snapshot consistency under an interposed actual enqueue (1), event-capacity (1),
rejected core stop (1), final-check failure (1), detached catalog (1), stale
status rejection (1), malformed/mixed/duplicate/unclosed/forged calls (9), tools
after rejected delegation (2), accepted/read/prose boundaries (4), real SQLite
abort/lost acknowledgement of accepted/rejected commands (4), stop barriers (3),
actual stop abort/lost replies (2), real post-COMMIT overrun (1), failed
continuations (3), closed store (1), independent closure/late callback (1),
observer stop (1), created-continuation stop (1), binding/catalog/old factories
(1), status/history byte, shape and 100/101-row bounds (1).

The exact fresh snapshot test interposes a real enqueue after the status
snapshot has been read, then asserts coherent old status versus new durable
inbox state. SQLite tests use real disposable databases, actual COMMIT errors
or transaction aborts, and actual reopened replay. The overrun stalls a real
post-COMMIT native call for 10,025 ms; it expects uncertainty with no resend.
100-row protocol capacity is tested separately from actual ledger capacity,
which may bind earlier; no claim is made that every 100-assignment state fits.

Controller checks: initial dispatch (1), optional read admission (1), optional
read continuation dispatch (1), delegation admission (1), receipt continuation
dispatch (1), final acceptance (1): at most six, within eight. Read-only/direct
paths consume fewer. Status itself uses exactly one checked projection. Bridge
operations have their own 10-second elapsed checks; they do not grant new loop
checks. Only one conversation, three requests and two tools; read at most once,
enqueue at most once and last. Keep 8 messages/32 KiB including trusted catalog,
24 KiB status, 64 KiB received, 64 retained events and 16 subscribers.

capture.py seals actual source/tests, compiled files, exact approval, test plan,
runtime and native dependencies before first changed-composition execution.
Three builds and four boundary checks have 60 seconds each. The focused 51-test
file has 240 seconds, followed by the full retained-plus-new 505-test suite at
the existing 1,320-second limit. Total sequential ceiling is 1,980 seconds.
Request/read/write elapsed limit stays 10 seconds and cleanup stays 5 seconds.
Run each stage once; on failure preserve incremental raw streams under .git,
diagnose, record the correction and new preflight before rerunning. No silent
retry, hidden deadline extension, disabled case or cleared uncertainty.

All old 454 cases remain. This is implementation qualification only; separate
exit review remains required. Native/provider integration and release stay HOLD.

The first focused attempt passed 47/51 and stopped before the aggregate suite.
FAILED-ATTEMPTS.json seals its diagnostics and local raw streams. Parent corrected
the receipt-versus-inspection assertion and moved ledger-pressure setup before
store reopen/binding. Running and uncertain fixtures now claim actual work and
explicitly settle unavailable proof for needs_attention, with exact state checks.
These are reviewed test corrections; no production fix or deadline extension.

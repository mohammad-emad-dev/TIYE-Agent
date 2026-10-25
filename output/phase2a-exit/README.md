# Phase 2A exit review

25 October 2026 — bounded internal synthetic engine

The [decision](decision.json) records acceptance against the explicitly approved
Phase2A contract. It covers durable sessions, bound roles, FIFO inboxes, concurrent
reservations, explicit reports, logical stop and interrupted-attempt recovery on
the existing fixed core/witness composition. It does not accept the complete team
engine or the finished product.

[Requirement and Architecture4 mapping](MATRIX.md) distinguishes every implemented
behavior from deferred product work. [The reviewed test plan](TEST-PLAN.md) binds
the exit checks before execution. Two added real SQLite tests close the remaining
boundary observations:100 sequential closed assignments still block assignment101,
and one mixed stop cancels queued/planned work while preserving dispatched
uncertainty, both before and after explicit recovery. No production TypeScript
changes are included in this review.

## Evidence and review

[Preflight](preflight.json) records source/test/compiled hashes, installed native/
dependency hashes and a freshly measured Node26.7.0 Windows x64 runtime. A different
runtime refuses qualification. [Verification](verification.json) records build,
source import-boundary and complete100-test SQLite/process execution; counts are
sealed from retained TAP matching its recorded stdout digest. Raw streams and
delegate artifacts remain local. No older qualification output is rewritten.

All three requested source-review attempts — GPT-6 Luna/max, Flint40B Free and
DeepSeekV4.1 Flash Free/max — timed out without a verdict. [Review](review.json)
records that limitation and confirms the test reported as touched predated those
calls and remained byte-identical to their supplied brief. There is no multi-model
agreement claim. The parent independently reviewed actual source and test behavior.

Specification result applies only to the bounded contract. Engineering acceptance
retains the documented trusted-coordinator, controlled-child, fresh-schema and
bounded-history assumptions. Full-history replay/projection rewriting remains
flagged without throughput qualification. test-guard reviewed the additive tests
against real database/witness boundaries; docs-guard checked current status and
Architecture4 mapping against actual APIs. No production fixes were needed.

Run `rtk proxy python -X utf8 -B output/phase2a-exit/verify.py` for current source/
artifact checks, approval binding and immutable historical evidence at qualifying
Git commits. Only the already documented Phase1B root README reconstructs its
Windows CRLF bytes. A reviewed rerun uses `capture.py` and must be freshly sealed.

## What follows

The Phase2A construction exception ends at this review under Architecture11.2.
Further engine/adapter construction needs an explicitly admitted scope; this
decision grants none. The next planning step is a bounded proposal for the next
engine behavior, informed by the deferred rows in MATRIX.md. Provider/native
integration and release remain **HOLD**. Product adapters, authenticated tools,
questions, automatic supervision/takeover, UI, terminal and project operations
remain outside this accepted slice.

# Phase 1A product core implemented

The project owner's explicit [approval](APPROVAL.md) activates the bounded
construction exception in Architecture 11.2. The first product package is now
[`packages/core`](../../packages/core/README.md): durable task-command decisions,
SQLite events and deterministic replay, with no effect runner.

The core separates fresh creation from reopening, preserves accepted and rejected
decisions across restart, refuses changed command reuse, and commits decisions,
events and task projections in one transaction. Reopen checks the exact schema,
integrity, event history and rebuilt projections without resetting unknown files.

Ten tests passed on Windows x64 / Node 26.7.0, including real SQLite transaction
abort/storage-full refusal, corruption/tamper controls, independent-process idle
ownership and crashes on both sides of the actual COMMIT boundary. Type/build and
core import checks passed. [Verification](verification.json) binds the final run
to source and dependency digests; raw diagnostics remain under `.git`.

## Review outcomes

GPT-6 Luna max and Flint 40B Free completed supplied-design reviews. DeepSeek
V4.1 Flash Free max timed out. The parent implemented and reviewed the final code
and reran the gates. The [review record](review.json) preserves both accepted
points and the rejected recommendation to substitute ordinary transaction locking
for the tested connection-lifetime lease. These were not final-code audits.

Initial verification exposed a Windows PowerShell security-module autoload failure
in fixture setup. The coordinator now uses the .NET security-descriptor APIs
directly. A deliberately corrupt-history fixture also needed foreign-key checks
disabled on its separate tampering connection; core enforcement remains on. Failed
runs were not counted as passing. The final tests use fresh source-bound fixtures.

## Current permission and next step

Internal Phase 1A is implemented and accepted within its pinned test composition.
Full integration/release readiness remains HOLD: S1–S6 partial, native L1/L2
partial, P1/P2 open, A1 blocked, and C0/final-PATH observations pending. Provider
routes, terminal/WSL integration, real project operations, exports and human
approval UI remain unimplemented or unqualified. This task does not change them.

The previous entry proposal and its pending decision record remain historical.
Its original verifier binds the pre-amendment architecture; it is not a current
gate checker after the approved edit. This cohort verifies that frozen proposal
at commit `2107f5c`, and separately binds the amended current architecture. No
historical seal was rewritten to make a changed reference appear unchanged.

Next: review the exact Phase 1B mock-witness source/test composition before
qualifying durable effect planning, fixture approvals and crash reconciliation.
No effect runner is included or enabled by Phase 1A acceptance.

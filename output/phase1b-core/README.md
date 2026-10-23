# Internal Phase 1B — durable synthetic effects

23 October 2026

This slice extends the accepted internal core with durable plans, exact fixture
approval, a committed one-time claim, and recovery using an independent durable
mock witness. Source lives in [packages/core](../../packages/core/README.md).

The [source-reviewed execution plan](TEST-PLAN.md) was frozen before the first
synthetic run. [Preflight](preflight.json) pins the actual reviewed sources,
compiled files, installed SQLite dependency files and runtime version before the
recorded run. [Verification](verification.json) records build, import-boundary and
real SQLite/process test results. The parent seals test counts from the retained
TAP capture after execution. [Review](review.json) distinguishes design feedback
from parent final source review; DeepSeek's timeout supplied no review verdict.

## What is implemented

- Fresh schema 2 SQLite events and replay-checked command/task/effect/approval
  projections in one transaction, capped at 1,000 events.
- Durable accepted/rejected plan redelivery; conflicting command payload refusal.
- Exact fixture approval and a claim committed before returning an invocation.
- Separate witness process/database recording every synthetic invocation without
  deduplication; observation only after writer exit.
- Single matching witness proof completes a claimed attempt without dispatch.
  Uncertain proof pauses the task. Paused attempts cannot automatically resume;
  unrelated tasks continue. Contradictory proof after completion refuses.
- Fresh-process crashes around plan, claim and outcome commits, including the
  independent witness commit before outcome recording.

Schema 1 and schema 2 remain separate. Migration and a common live task registry
are not implemented. Fixture approval is not authenticated user consent; proof
is trusted coordinator traffic, not an untrusted-party authentication protocol.
Cancellation after claim records attention but cannot revoke an issued request.
Deadlines use wall-clock time; power loss, hostile mutation, Electron ABI, WSL
execution and full host-crash supervision remain unqualified.

## Verification and historical evidence

Run `rtk proxy python -X utf8 -B output/phase1b-core/verify.py` from the repository
root to check the sealed hashes and historical Phase 1A sources at `4f237b1`.
It checks evidence consistency; it does not rerun effects or confer admission.

For an explicitly reviewed rerun, build first and run `capture.py`; it creates a
new private local capture directory and writes a preflight before tests. That
changes the sealed output and requires a new parent review/seal before publishing.
The recorder does not install dependencies. Raw output, paths and relay reports
remain local beneath `.git` or the delegation artifact root. Public evidence
contains source/report digests, runtime versions and summarized verdicts only.

Historical Phase 1A artifacts are unchanged. Its original verifier binds the old
package composition, so use its pinned Git revision for that historical claim.
The Phase 1B verifier checks those historical source hashes and frozen artifacts
explicitly instead of rewriting earlier evidence.

## Remaining work

Explicit attention resolution, schema convergence, team engine and its production
orchestration remain ahead. No real effect runner, provider, native CLI, project
operation, Git, network, export or release route is enabled by this slice.
S1–S6 and L1/L2 remain partial, P1/P2 open, A1 blocked and final-PATH/C0 pending.
Full native/provider integration and release remain **HOLD**.

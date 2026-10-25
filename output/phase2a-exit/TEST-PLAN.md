# Phase 2A exit verification plan

25 October 2026. Target: approved internal synthetic contract at proposal8f2d0a2,
activated by the explicit owner response recorded at4ce785d. Baseline:93f417d.
The construction scope includes its required exit tests; no new production
capability is added by this review. Parent reviewed the current source, fixed
host/witness composition and both additive tests before first execution.

## Independent verification contract

Specification axis: check all six command families, bound roles, one immutable
session, FIFO, member/global occupancy, shared ledger and atomic state changes,
one-time claim/recovery, witnessed outcome versus reported completion, uncertain
stop, budget protection, lifetime ceiling and strict startup validation.

Engineering axis: confirm existing shared store/writer/replay rather than a
parallel engine, fixed imports/children, unchanged native dependency, propagation
of storage faults, owned private roots/handles, real database rollback and bounded
history. No throughput, OS sandbox, hostile in-process authentication or whole-host
crash guarantee is inferred. All production TypeScript must remain byte-identical
to93f417d; test changes are limited to `test/engine-exit.test.cjs`.

The source review traces contract requirements to the observables in MATRIX.md.
Every engine wire DTO/hash/event remains as qualified in the session/inbox/stop/
lifecycle plans. Existing1000-event formula and100-lifetime-assignment ceiling are
unchanged. The trusted owner uses recovery after reopen; conservative early
acknowledgement on a live claim cannot resend an action and remains a documented
trusted-coordinator behavior. Stop remains terminal for the immutable session.

## Two missing boundary observations

1. Create100 distinct assignments sequentially with maxConcurrent1. Each is
   started, cancelled before any claim and closed through a matching failed
   member report. All100 occupy retained history with zero held budget and empty
   live inbox. Assignment101 must durably reject despite free live occupancy.
   Reopen must preserve that limit and the original accepted/rejected retries.
   This uses roughly500 real event transactions, not direct database seeding.
2. In one session prepare a dispatched task with exactly1 independent witness
   row, an unclaimed planned task with a separate empty witness, and a queued
   task. One stop must cancel queued/planned work but preserve dispatched
   uncertainty, attention sequence, occupancy and held budget. Raw claims/start
   cannot revive stopped work. Reopen and explicit confirmation close the last
   assignment cancelled, without a second witness write. Run ordinary and
   explicitly recovered dispatched variants through the same scenario.

Retain all98 existing tests, including real SQLite transaction aborts, role/input/
namespace refusal, FIFO/capacity pressure, independent zero/one/duplicate/conflict
witness proof and fresh owned-host crashes before/after actual COMMIT around
session/enqueue/start/report/recovery/claim/stop. No skips or mock stores are
introduced. The fixed witness writer always exits before observation; core code
never launches it. Children retain10-second operation and5-second teardown bounds.

## Execution and seals

Build with the pinned TypeScript compiler for reviewed compiled hashes. Before
the suite, `capture.py` rechecks installed dependency/native hashes, measures Node
version/platform/architecture/modules, refuses an unexpected runtime and writes a
preflight containing source/test/compiled/plan hashes. It then runs build, source
import boundary and the complete real SQLite/process test suite. Raw streams stay
under `.git`; public verification stores step statuses and digests only. Require
identical source and compiled hashes after execution. Seal actual TAP counts only
from retained output matching the recorded stdout digest. No failed run is a pass.

The three requested model reviews received actual source and this contract. All
timed out without verdicts. Their reports are unavailable evidence, not agreement.
The only reported touched file was the test already present in their supplied
brief; exact source/test content was compared against that brief after closure.
The parent owns the independent source/test review and acceptance decision.

Verify frozen earlier manifests/artifacts at their qualifying Git revisions,
including93f417d's lifecycle evidence. Reconstruct only the previously documented
Phase1B root README CRLF digest. Do not rewrite old seals to fit current sources.

Passing this plan can close only the Phase2A internal contract. Architecture4's
full engine, provider/native adapters, terminal control, authenticated MCP, real
project/Git/export actions, release and further construction remain outside its
decision. The exception ends at this exit review under Architecture11.2.

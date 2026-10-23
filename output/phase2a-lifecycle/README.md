# Phase 2A: assigned reports, recovery and uncertain stop

23 October 2026 — bounded synthetic lifecycle; full exit review pending

Member-bound result reporting now distinguishes a completed effect from a
completed task. Witness proof leaves the task running with its slot held; only
an eligible done/failed report closes the assignment and stores its summary.
Uncertain work cannot free a reservation through prose or a timeout.

Explicit owner recovery acknowledges interrupted attempts once and reconstructs
reconciling state without resending. Reopen performs no action and fences new
writes until recovery or stop addresses newly interrupted work. The lifetime
exclusive SQLite lease continues to exclude another owner.

Stop now handles dispatched mock work: uncertainty stays visible/reserved until
explicit resolution. Confirming completion after stop closes cancelled; uncertain
closure closes failed. Neither infers done. Queued/planned cancellation retains
the previous atomic stop behavior. Existing attention retains its original sequence.

See [package API/state/capacity documentation](../../packages/core/README.md#phase-2a-bounded-synthetic-team-engine)
and the [source-reviewed test plan](TEST-PLAN.md). Assignment/result/recovery and
attention-sequence views are event-derived; no second database or writer is added.
The eight-event assignment budget and one active stop slot remain protected.

## Review and verification

GPT-6 Luna/max returned a supplied-design review. Flint40B Free and DeepSeekV4.1
Flash Free/max both failed before returning a verdict. The [review record](review.json)
records outcomes and report digests. Parent review pins actual source, role/hash
bindings, atomic recovery accounting, replay mappings, capacity and stop semantics;
model design advice is not presented as a final code audit.

[Preflight](preflight.json) binds actual source/tests/compiled output, plan and
installed dependency/native hashes before execution. [Verification](verification.json)
records build, source import boundary and real SQLite/process checks. Twenty-one
new tests extend the prior77; one obsolete assigned-dispatch refusal test is
replaced with approved/witnessed completion retaining occupancy until report.
Raw output stays local; counts are sealed from retained matching TAP digests.

Tests cover report eligibility and summary persistence, FIFO/global occupancy,
uncertain-member isolation, duplicate witness detection, recovery fences/no resend,
one-time/multi-member recovery, stop uncertainty, raw cancellation/expiry, rollback,
held-budget exhaustion, tamper refusal and eight fresh COMMIT-boundary crashes.
The fixed core/witness composition is the only admitted assigned execution.

Run `rtk proxy python -X utf8 -B output/phase2a-lifecycle/verify.py` to verify current
source/artifact hashes, owner approval and immutable historical evidence against
qualifying Git commits. The Phase1B root README alone reconstructs its recorded
Windows CRLF bytes. A reviewed rerun uses `capture.py` and requires fresh sealing.

clean-code-guard: shared lifecycle decision/closure/budget rules and canonical
codec reuse; existing bounded replay/projection rewriting remains flagged without
throughput qualification. test-guard: real SQLite/filesystems/owned hosts, boundary
trigger injection only, no internal fake stores. docs-guard: current API, state and
admission claims updated; historical seals remain unchanged.

## Next

Complete the Phase2A exit review, including an explicit Architecture4 behavior
mapping and remaining deferred requirements. No UI, provider/native adapter,
terminal, authenticated transport, real project/Git/export action or release is
admitted. All provider/native integration and release gates remain **HOLD**.

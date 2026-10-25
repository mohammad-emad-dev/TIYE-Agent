# Durable questions, escalation and answers

25 October 2026 — approved internal Phase2B component; full exit review pending

Members can now persist a question, wait with their task blocked and receive an
explicit authorized answer. A member question goes to its Leader; a Leader question
goes directly to the owner. The Leader can escalate the same member question once
without needing its own task. Old recipient authority ends when escalation commits.

Question state, route, answer, event-sequence bindings and blocked task views share
the existing SQLite transaction and replay. The member/global reservation stays
held while waiting. Answering closes only the question: it never approves, executes
or reports. Completed effects remain report-only, and an expired plan cannot gain
an invocation through an answer. Fresh schema4 is explicit; schemas1-3 retain
existing behavior, with no migration or reset.

[The scope record](../phase2b-approval/README.md) retains the owner's exact instruction
to continue following presentation/clarification of the frozen2766d76 amendment.
[The contract](../phase2b-entry/CONTRACT.md), [package API](../../packages/core/README.md#phase-2b-durable-questions-and-answers)
and [reviewed test plan](TEST-PLAN.md) define role filtering, DTOs, raw bypass gates,
lifetime ceilings, separate question budgets and stop/recovery behavior.

Stop cancels open questions atomically and releases their separate unused budgets,
while existing task/effect rules preserve uncertain reservations. Completed stopped
work can still require failed reporting. Reopen never answers or dispatches work;
recovery preserves pending questions and must clear its existing fence before new
answers. One question per assignment and20 lifetime questions per session bound
this slice; neither closure nor reopen resets those counts.

## Review and evidence

[Preflight](preflight.json) binds reviewed source/tests/compiled output, approval,
plan, measured runtime and installed native/dependency hashes before execution.
[Verification](verification.json) records build, import boundary and real SQLite/
process checks, with actual retained TAP counts sealed against stdout digests.
All100 prior tests remain;23 added checks cover routes/roles/visibility, raw API
and replay bypass, blocked occupancy, limits/budgets, actual rollback, tamper and
eight fresh COMMIT-boundary crashes with independent witness counts.

The [first attempt](attempt-1.json) hit the240-second aggregate capture limit
without retained partial TAP and is inconclusive. The final capture retains
streams during execution and allows420 seconds for the full suite, keeping each
child's existing10/5-second operation/teardown bounds. It does not count a timeout
as a pass or hide it with a retry.

GPT-6 Luna/max, Flint40B Free and DeepSeekV4.1 Flash Free/max were invoked for
selected-module reviews but all timed out without a verdict. [Review](review.json)
records this limitation and the pre-existing worktree entries they reported;
there is no claim that a model passed the implementation. The parent reviewed
the final source, tests, compatibility and documentation before execution.

clean-code-guard: shared canonical codec, ledger, state/budget and stop logic;
unvalidated stop data is validated before question cancellation. Existing bounded
full replay/projection rewriting remains flagged without throughput qualification.
test-guard: real SQLite, fixed owned hosts and independent witness; only SDK boundary
injection for real projection aborts. docs-guard: current APIs and partial-scope
claims checked; historical records remain frozen.

Run `rtk proxy python -X utf8 -B output/phase2b-questions/verify.py` to check current
source/artifact hashes, Phase2A and Phase2B scope records and frozen historical
evidence. The old Phase1B root README alone reconstructs its measured CRLF bytes.
A reviewed rerun uses `capture.py` and requires fresh retained-output sealing.

Next is the full Phase2B exit review. Multiple questions per task, in-flight-effect
questions, automatic supervision/answers, takeover, authenticated tools, providers,
UI, terminals and real project operations remain outside this slice. Native/
provider integration and release remain **HOLD**.

# Phase 3G exit review

The approved fixed offline Leader-handoff contract passes its bounded exit
review. Production bytes remain identical to implementation b1cc5c3. Two new
actual-core tests retain all 550 prior cases and close the two remaining
boundaries of the contract. The construction gate refuses created, queued,
running, blocked, uncertain, done and notice-less failed predecessors before
any adapter exists. A chained rehabilitation preserves both handoff lineages
with increasing sequences: the loop-created successor is started, failed with
a closed notice and handed off again while the original predecessor stays
failed and the second successor queues.

Parent reviewed the fixed handoff catalog codec, the Leader-bound handoff
bridge, reserved successor/continuation capacity, catalog detachment, receipt
immutability, stop ordering and disposal. Existing cases cover handoff of
eligible failures with actual continuation, duplicate and stale handoffs,
capacity refusal, title and identity grammar, malformed/mixed/unclosed/forged
calls, tools after rejected handoff, SQLite abort/lost replies, measured
overrun, stop barriers, observer reentrancy, closed stores and replay.

Architecture4.2 gains only the bounded handoff_task addition over the accepted
context/report/question/mission/status/delegation subsets. Architecture 5.1/5.3
still have fixed offline lifecycle and bounded in-memory scripted loops.
Providers, complete team tools, authenticated transport, durable conversation
recovery, file/command tools, UI, packaging and release are unfinished. Native
operations have elapsed overrun detection after return, not preemption. No
rejecting/generic adapter is admitted; the outstanding stop-rejection
requirement remains open for such integration.

This ends the Phase3G construction exception and grants no new scope.
decision.json records bounded acceptance; verification.json/evidence.json seal
actual results. Raw streams remain local under .git. From the repository root
run:

`rtk proxy python -X utf8 -B output/phase3g-exit/verify.py`

# Phase 3H bounded Leader failure view

The explicit offline Leader profile exposes the existing Leader-visible
failure projection through one fixed read-only `get_failures` tool. It uses a
frozen roster catalog; model fields cannot choose actor, session, command
identity or task IDs. The bridge alone captures the existing Leader-visible
`failures()` reader. No failure observation, task creation, handoff,
scheduler, approval, claim, invocation or retry capability reaches the loop.

get_failures accepts exactly `{}` and derives one detached immutable result
from one fresh replay-checked projection. At most one read per conversation:
one optional get_my_context OR get_failures. A text-only conversation is
allowed; a second read of either kind refuses before any core reread. Aborted
snapshots, measured overruns and overflow fence uncertainty without retry.
Read state separate from conversation completion. Unknown failures remain
unknown even with verified local cleanup.

One conversation, at most three requests/one read. Worst-case continuation
capacity is checked before writing. No automatic polling, task start, report,
question, answer, delegation, handoff or completion.

The [scope decision](../phase3h-approval/README.md) records continuation
against 93d6588. [TEST-PLAN.md](TEST-PLAN.md) specifies the new real-core
tests plus all 552 retained cases; [REVIEWS.md](REVIEWS.md) records the static
review and every defect it corrected, including the execution-stage repairs.
The qualification run has **not yet passed**. Earlier captures stopped at the
build and focused stages; their raw streams remain under
`.git/tiye-phase3h-failure/`, and a new preflight supersedes their output
files. No test-pass claim is made until `verify.py` exits 0. From the
repository root, run:

`rtk proxy python -X utf8 -B output/phase3h-failure/capture.py`

This is a restricted subset of Architecture4.2/4.7/offline5.1/5.3. It creates
no command, assignment or lineage. Core/mock-team production source and
schema7 remain unchanged. A separate exit review is pending. Providers,
generic/rejecting adapters, authenticated transport, durable loop recovery,
full team tools, files/commands, UI, packaging and release remain unfinished.
Native synchronous calls are measured after return; there is no preemption
guarantee.

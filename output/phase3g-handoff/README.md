# Phase 3G bounded Leader handoff

The explicit offline Leader profile hands off one eligible failed task into
one queued successor task for one roster member under a bounded title. It uses
a frozen reference catalog; model fields cannot choose actor, session, command
identity, successor task identity or arbitrary task IDs. The bridge alone
captures the existing Leader-bound handoff writer. No failure-observation,
task-creation, scheduler, approval, claim, invocation or retry capability
reaches the loop.

handoff_task derives a detached immutable receipt only after the actual
actor-bound command hash, handoff lineage and successor assignment agree.
Actual receipt data enters the fixed backend's continuation. Historical
acceptance is distinct from current task state and final prose. Unknown
acknowledgement fences uncertainty even with verified local cleanup.

One conversation, at most three requests/two tools, one optional context read
and one final handoff. The handoff is the final tool even after rejection.
Worst-case receipt continuation capacity is checked before writing. No
automatic polling, second handoff, task start, report, question, answer,
delegation or completion.

The [scope decision](../phase3g-approval/README.md) records continuation against
6639d5e. [TEST-PLAN.md](TEST-PLAN.md) specifies 43 new real-core tests plus all
507 retained cases. The initial focused failure and corrections remain recorded
in FAILED-ATTEMPTS.json. verification.json/evidence.json record actual
qualification; raw captures remain local under .git. From the repository root run:

`rtk proxy python -X utf8 -B output/phase3g-handoff/verify.py`

This is a restricted subset of Architecture4.2/offline5.1/5.3. It creates only
the queued successor assignment and handoff record: no plan, approval, claim or
invocation. Core/mock-team production source and schema7 remain unchanged. A
separate exit review is pending. Providers, generic/rejecting adapters,
authenticated transport, durable loop recovery, full team tools, files/commands,
UI, packaging and release remain unfinished. Native synchronous calls are
measured after return; there is no preemption guarantee.

# Phase 3F bounded Leader coordination

The explicit offline Leader profile reads team status and queues one already
prepared task for one roster member. It uses a frozen reference catalog; model
fields cannot choose actor, session, command identity or arbitrary task IDs.
The bridge alone captures the existing Leader enqueue capability. No scheduler,
approval, claim, invocation or task-creation capability reaches the loop.

get_team_status derives a detached projection from one checked snapshot, preserving
FIFO queues and occupied blocked/uncertain reservations. delegate_task returns a
detached immutable receipt only after the actual actor-bound command hash and
assignment agree. Actual receipt data enters the fixed backend's continuation.
Historical acceptance is distinct from current task state and final prose.
Unknown acknowledgement fences uncertainty even with verified local cleanup.

One conversation, at most three requests/two tools, one optional context/status
read and one final delegation. Worst-case receipt continuation capacity is checked
before writing. The trusted catalog counts toward 8 messages/32 KiB history;
status has a 24 KiB bound. Stop may cancel accepted queued intent while the known
receipt remains. No resend, automatic polling or completed-session exception.

The [scope decision](../phase3f-approval/README.md) records continuation against
8fef7ae. [TEST-PLAN.md](TEST-PLAN.md) specifies 51 new real-core tests plus all
454 retained cases. The initial focused failure and corrections remain recorded
in FAILED-ATTEMPTS.json. verification.json/evidence.json record actual qualification;
raw captures remain local under .git. From the repository root run:

`rtk proxy python -X utf8 -B output/phase3f-coordination/verify.py`

This is a restricted subset of Architecture4.2/offline5.1/5.3. It cannot create
new task instructions, delegate to multiple recipients or execute queued work.
Core/mock-team production source and schema7 remain unchanged. A separate exit
review is pending. Providers, generic/rejecting adapters, authenticated transport,
durable loop recovery, full team tools, files/commands, UI, packaging and release
remain unfinished. Native synchronous calls are measured after return; there is
no preemption guarantee.

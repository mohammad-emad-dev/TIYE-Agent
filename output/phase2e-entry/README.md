# Next slice: explicit recovery handoff

27 October 2026 — proposal only; construction scope decision pending.

Phase2D at2aa8abf accepted conservative failure handling with158 passing tests.
The next engine behavior lets the Leader explicitly hand reconciled failed work
to a fresh queued task. An immutable link preserves what failed, who receives the
new work and when. The old effect is never rearmed; successor work requires normal
planning and approval. No automatic process or model action follows the handoff.

The matching schema7 mission rule allows successful recovered workflows only when
every failed predecessor has a complete handoff chain ending in a proven and
explicitly reported successful task. Failure history remains intact. Missing or
uncertain successor work cannot be hidden by a completion summary.

Review [AMENDMENT.md](AMENDMENT.md) and [CONTRACT.md](CONTRACT.md). Fresh schema7,
closed DTO/hash/roles/views, one-event task/assignment/lineage creation, eight new
held units, ten lifetime handoffs and unchanged100 assignment ceiling are specified.
No engine source/tests or current architecture permission changes in this proposal.
After approval, coding proceeds within this contract through its bounded exit.
UI, live detection, automatic takeover/succession, providers and release remain HOLD.

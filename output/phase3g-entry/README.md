# Phase 3G proposal: bounded Leader handoff

1 November 2026 — proposal only; construction pending owner decision.

[Phase 3F exit](../phase3f-exit/README.md) at `5726ac7` retained 507 passing
tests and accepted the bounded Leader-coordination contract. The next proposed
package exposes the existing schema7 Leader handoff engine through one fixed
offline profile: the Leader picks one eligible failed task from a trusted
catalog, one roster member, and a bounded successor title, and the core creates
one queued successor task with an immutable handoff record. No observe-failure,
task-creation, scheduler, approval, claim or invocation capability reaches the
loop.

The [amendment](AMENDMENT.md) and [contract](CONTRACT.md) define the exact
proposed scope. Eligibility uses one fresh replay-checked projection; the
handoff uses the existing Leader-bound `team.task.handoff` command and
validates the actual command record and handoff lineage before returning a
receipt. Rehabilitation of failed work stays explicit, historical and
Leader-authorized.

This is a bounded subset of Architecture 4.2/4.3, not the complete delegation
tool. It preserves schema7, core/mock-team production code and all old adapter
profiles. Providers, authenticated transport, durable loop recovery, file
ownership and effects, UI, packaging and release remain unfinished.

Run `rtk proxy python -X utf8 -B output/phase3g-entry/verify.py` from the root
to verify this proposal and its unchanged source baseline. This checker does not
run the proposed composition or repeat the engine test suite.

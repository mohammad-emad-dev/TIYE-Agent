# Phase 3F proposal: bounded Leader coordination

27 October 2026 — proposal only; construction pending owner decision.

[Phase 3E exit](../phase3e-exit/README.md) at `6a11f79` retained 454 passing
tests and accepted the fixed offline mission-completion contract. The next
proposed package combines a bounded `get_team_status` read with `delegate_task`
for one existing prepared task and one roster member. This makes inbox admission
reachable from a Leader tool without making scheduler execution reachable.

The [amendment](AMENDMENT.md) and [contract](CONTRACT.md) define the exact proposed
scope. Status uses one fresh replay-checked projection. Delegation uses the
existing Leader-bound `enqueue` command and validates the actual command and
assignment before returning a receipt. New task creation, free-form task
instructions, multi-recipient delegation and execution are deferred.

This is a bounded subset of Architecture 4.2, not the complete delegation tool.
It preserves schema7, core/mock-team production code and all old adapter profiles.
Providers, authenticated transport, durable loop recovery, file ownership and
effects, UI, packaging and release remain unfinished.

Run `rtk proxy python -X utf8 -B output/phase3f-entry/verify.py` from the root
to verify this proposal and its unchanged source baseline. This checker does not
run the proposed composition or repeat the engine test suite.

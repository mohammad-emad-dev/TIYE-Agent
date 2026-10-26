# Next slice: explicit mission completion

26 October 2026 — ready for scope review, not authorized for construction.

Phase2B completed durable questions and its bounded exit at95bd198. The next useful
engine milestone is the successful end of the workflow: the Leader explicitly
reports the mission complete only after every task has a proven effect and an
accepted successful result. No queued, failed, blocked or uncertain work can hide
behind a completion summary. Completed sessions cannot admit fresh work.

Review [AMENDMENT.md](AMENDMENT.md) and [CONTRACT.md](CONTRACT.md). The contract
specifies authority, closed DTO/hash/event, fresh schema5 compatibility, terminal
state, shared capacity reserve, recovery and required actual SQLite/crash checks.
This is a proposal only; no engine source, tests, runtime or current architecture
permission is changed. The full accepted baseline remains frozen and verified.

The new scope needs the owner's decision because Architecture11.2 explicitly
ended Phase2B permission at its exit. After approval, implementation proceeds
within this frozen contract through its own review, rather than another design
round. Provider/native integration, UI and release remain HOLD.

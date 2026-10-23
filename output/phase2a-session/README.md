# Phase 2A session foundation

23 October 2026 — first implementation component; full engine still in progress

The owner [approved Phase 2A](../phase2a-approval/README.md) against frozen proposal
`8f2d0a2`; approval and the architecture activation were pushed at `4ce785d`.
This component starts engine coding with durable session creation and roster
contexts. It does not claim the complete Phase 2A contract or team engine.

## Implemented

- Fresh schema 3 roots use the existing core writer, command ledger and event
  transaction, plus an exact replay-checked sessions projection.
- One immutable session roster of 1–5 distinct members, one included leader and
  validated concurrency configuration. Configuration is stored, not yet enforced
  by a scheduler.
- A coordinator owner handle creates the session; bound member handles expose
  their own read-only identity/role context without owner operations or raw store.
- Durable accepted/rejected creation, exact redelivery across reopen, cross-type
  command conflict refusal and atomic rollback on failed projection writes.
- Schema 2/3 use explicit different factories/openers, without migration/reset.
- One event remains reserved for future session stop; assignment reserves and
  stop execution are not implemented by this component.

See [the package API](../../packages/core/README.md) and the exact
[source-reviewed execution plan](TEST-PLAN.md) for DTO, hash and boundary rules.
Shared hashing and text validation avoid separate session-specific semantics.

## Verification

The parent reviewed actual source/tests and fixed-host changes before execution.
[Preflight](preflight.json) pins source/test/compiled composition, runtime version
and installed dependency/prebuild digests. [Verification](verification.json)
records build, import-boundary and real SQLite/process results; counts are sealed
from retained TAP output matching its digest. [Review](review.json) records parent
code/test/docs checks and the limited role of the earlier entry-design reviews.

Coverage includes the 45-test baseline plus session redelivery, roster/identity
validation, bound member contexts, unchanged returned snapshots, shared ledger,
exact schema refusal, true SQLite abort rollback, tamper refusal, idle owner
exclusion, a near-limit history fixture and crashes before/after session COMMIT.
Each child retains the existing ten-second operation/five-second verified teardown.

Run `rtk proxy python -X utf8 -B output/phase2a-session/verify.py` to check sealed
source/artifact hashes, approval target and immutable earlier snapshots. This
checker does not execute an engine or mock action. The specific historical Phase
1B root README digest is reconstructed from its Windows CRLF checkout bytes.

An explicitly parent-reviewed rerun may build then run `capture.py`; it writes
a fresh preflight and local capture and requires a new review/seal before publishing.
Raw captures remain local beneath `.git`; public records contain digests/verdicts.

## Next within the approved scope

Durable inboxes and assignments, atomic FIFO start, concurrency reservations,
member result reporting, logical stop and recovery remain to be implemented.
Their eight-event assignment budget, claim fences and full exit matrix remain
mandatory. This foundation does not approve bypasses or close those requirements.
No further owner approval is needed for work inside the approved Phase 2A contract.

No new executable, dispatcher, provider, native CLI, terminal, MCP/network server,
credential route, project operation, Git, export or release is added. Member
handles are an internal trusted-coordinator boundary, not hostile-process
authentication. Native/provider integration and release remain **HOLD**.

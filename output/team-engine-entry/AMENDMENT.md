# Proposed Phase 2A construction amendment

23 October 2026 — **PROPOSAL; owner approval pending**

## Decision

Approve the following addition to Architecture 11.2, together with the bounded
[construction contract](CONTRACT.md):

> After acceptance of the shared internal core at `ab8da5f`, permit internal
> Phase 2A construction of a headless synthetic team engine: one immutable session
> roster, durable per-member FIFO inboxes, bounded concurrent reservations,
> explicit fixture result reporting, logical stop and deterministic recovery.
> Commands, queue reservations and any synthetic effect plans must share one
> SQLite transaction and command ledger. Execute only the existing fixed owned
> core/witness test composition after parent review of its actual source and
> source-bound preflight. This does not admit a generic dispatcher, new executable,
> provider, native CLI, PTY/terminal, MCP/network server, credentials, real project
> changes, Git, exports, licensing or release. No migration of existing databases
> is included. Existing feasibility, ownership and release gates remain mandatory
> before their dependent integration. The product still ships complete.

Approval changes construction sequencing for this exact slice. It does not mark
S1–S6 passed, authorize account use or qualify a production adapter. It ends at
the Phase 2A exit review; subsequent capabilities require their applicable decision.
Source development follows approval; first execution additionally waits for parent
review of the actual source, fixture composition and recorded preflight hashes.

## Why a new decision is required

The approved first-core amendment explicitly lasts through its 1A/1B internal
milestone and requires a new decision for changed scope. Architecture 11.2 lists
the team engine as the next construction phase. The core's accepted task registry
does not itself authorize the engine or additional process capabilities.

This proposal is the concrete review target, not evidence that the engine exists.
Delegated model feedback is advisory and cannot substitute for owner approval.
The existing architecture and immutable earlier records are not rewritten while
this amendment is pending.

An explicit response such as **“Approve the internal Phase 2A amendment”** approves
this amendment and its linked contract. Record that response, date, frozen commit
and artifact digests separately before applying the amendment. Rejection keeps
the engine on HOLD and preserves the already accepted core.

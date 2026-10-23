# First Phase 2A component — session foundation

23 October 2026 — parent source review before first execution

Owner approval is recorded at `4ce785d`, binding proposal `8f2d0a2`. This source
implements the first session/roster component only. It does not satisfy the full
engine exit contract. Queues, assignment reservations, start/report/stop/recovery
commands and their eight-event assignment budgets remain to be implemented.

## Reviewed composition

The parent reviewed `engine-session.ts`, shared text/hash extraction, schema 2/3
branches of the existing store/reducer, public types, fixed mock-host additions
and `session.test.cjs` before execution. Existing fixed witness, storage allocator
and owned-child supervisor are retained. No dependency or launcher is added.
`preflight.json` records actual source/tests/compiled files, runtime version and
installed dependency/prebuild digests before each run. Changes require new review
and preflight. Raw captures stay local beneath `.git`.

Fresh `TaskStore.createEngine` roots use schema 3 with the exact existing tables
plus `sessions(id,value)`; `openEngine` requires that version. Existing create/open
remain schema 2. No migration, reset or downgrade is performed. One SQLite owner,
ledger and transaction path serve session and existing task/effect commands.

The owner handle alone exposes session creation. Member handles contain only a
bound read-only context closure, with no actor parameter, store, factory or owner
method. The trusted coordinator owns the raw store; it does not pass it to member
fixtures. This is not authentication against hostile code in the trusted process.

## Exact current command

`team.session.create` v1 fields: type, version, commandId, sessionId, leaderId,
members and maxConcurrent. Each member has exactly memberId/name/instructions.
IDs are lowercase UUID-v4; 1–5 unique member IDs; leader must belong to the roster;
concurrency is an integer from 1 through roster length. Name/instruction bounds
match existing text limits: 1–256 Unicode scalars, at most 1024 UTF-8 bytes and no
lone surrogates. Text is preserved without normalization.

Wire input is at most 16 KiB, compact canonical UTF-8 JSON, with no BOM, duplicate
members or extra fields. Object member order can vary; validation rebuilds its
canonical DTO. Numeric aliases that change on JSON re-encoding refuse. Actor is
not a wire field. The owner identity is bound by the closure and persisted as owner.

Command hash: SHA-256 of UTF-8 JSON.stringify of
`["team.session.create",1,"owner",commandId,sessionId,leaderId,maxConcurrent,
members.map(m=>[m.memberId,m.name,m.instructions])]`, lowercase hexadecimal, with
no newline. The event body is canonical `{command,actor:"owner",result}` and type
`team.session.create`. The reducer independently verifies result: accepted only
when no session exists, otherwise durable rejected. Decision, event and roster
projection commit together. Exact redelivery returns the saved decision; changed
payload or cross-domain command ID refuses. The accepted roster is immutable.

The 1,000-event cap keeps existing effect reserves plus one slot for future
session stop while a session exists. Stop execution and assignment budgeting are
not claimed by this component. Further traffic cannot consume that last slot;
exact committed redelivery still works at capacity.

## Gates

Retain all 45 accepted regression tests and run real SQLite/private-root tests for:

- Accepted/rejected session redelivery across reopen, stable roster, member role
  contexts, independent returned snapshots and closure failure after store close.
- Malformed IDs/rosters/concurrency/text, self-selected actor or role fields,
  invalid/duplicate/noncanonical/oversized wire input without writes.
- Shared command namespace with task creation and a shared task/session snapshot.
- Exact schema openers refusing the other version without altering either root.
- Actual SQLite abort during session projection insertion rolls back ledger/event.
- Tampered persisted session decision/projection refuses startup.
- A separate idle schema 3 owner receives SQLITE_BUSY, without resetting locks.
- A valid near-limit real SQLite history fixture preserves the future stop slot.
- Owned child crashes immediately before/after SQLite COMMIT; a fresh process
  recovers zero/one roster and redelivery commits/returns one decision only.

Each child has a ten-second operation deadline and five-second verified teardown.
Core execution adds no child-process/network imports. Only the fixed trusted test
host launches; its session operation is owner-coordinator traffic, not a member
transport. No witness action is needed for session creation.

No providers, native CLIs, terminals, MCP, credentials, real projects, Git,
networking, exports or release are admitted. Phase 2A remains under construction;
native/provider integration and release remain HOLD.

# Phase 1B source review and bounded execution plan

23 October 2026 — parent review before first synthetic execution

Prerequisite: Phase 1A accepted at `4f237b1`. The owner's explicit approval of
the internal amendment and continued implementation instruction authorize this
separately reviewed synthetic composition. The frozen proposal and original
approval remain historical. This activates only the described Phase 1B tests.

## Reviewed composition

The parent reviewed `effects-model.ts`, `effects-store.ts`, their entry exports,
the shared connection settings, fixed `mock-host.cjs`, fixed `witness.cjs`,
`effects.test.cjs`, process supervision and the unchanged private-root allocator.
`preflight.json` records the exact source, test and compiled-file hashes before
execution. Any source correction requires a new dated preflight before rerun.
Dependencies must match the recorded Phase 1A installed-file hashes. No install
scripts or new dependencies are needed. Build and import checks precede tests.

The trusted test coordinator allocates owned disposable Windows directories,
verifies current-user DACLs and ancestor reparse attributes, and launches only
fixed scripts using the current Node executable. Inputs contain synthetic IDs,
bounded payloads and deadlines. No product process launcher exists. A committed
claim returns an invocation only after SQLite COMMIT. It is never reissued.

The witness process owns a separate SQLite file in a separately verified root.
Each successful append is the entire mock action. It appends every invocation
without deduplication, FULL-commits before acknowledgement, verifies its fixed
schema/target and rejects expired invocations. The observer starts after writer
exit and returns at most two rows matching either effect or attempt, exposing
duplicates and conflicting bindings. No witness data is inside the core transaction.

## Tests and assertions

- Durable accepted/rejected plans; exact redelivery and conflicting command IDs.
- Exact approval binding to effect, attempt, target, operation, payload hash and
  expiry; missing or mismatching approval cannot claim.
- A claim survives reopen; another claim is refused even when its reply was lost.
- Independent witness commit followed by core reopen reconciles exactly once.
- Absent, unreadable, malformed, duplicate or conflicting proof pauses that
  attempt; another task can complete. Attention is terminal in this slice.
- Cancellation before claim and deadline-before-claim stop dispatch; cancellation
  after claim records attention. Already-issued invocations are not revocable
  capabilities; this is cooperative synthetic cancellation, not an OS fence.
- Witness rechecks deadline at append; no guarantee against wall-clock rollback
  or revocation of an action already executing is claimed.
- Schema 1 and schema 2 refuse each other's files; replay detects projection drift.
- Fresh child crashes at the actual SQLite SDK COMMIT boundary before/after
  planning, claiming and settlement, including witness commit before outcome.
  Fresh processes reopen storage and recover the expected state without dispatch.
- Existing Phase 1A tests remain mandatory regression checks.

Each child has a ten-second operation deadline and five-second teardown bound.
The coordinator terminates only its held owned child handle and verifies exit.
Raw diagnostics stay beneath `.git`; public evidence contains hashes and verdicts.
Root deletion uses the existing generated-root checks. Full host-crash cleanup,
power loss, hostile same-user mutation and a production effect runner are unqualified.

## Storage and authority limits

Fresh schema 2 stores command decisions, events, tasks, effects and approvals in
one transaction, with replay-checked projections and a 1,000-event limit. It is
a separate internal store from schema 1, with no migration or shared live task
registry. Approvals are synthetic fixture bindings supplied by the trusted
coordinator; proof bytes are observations from its fixed witness, not authenticated
messages from an untrusted party. No UI/user-consent or provider entitlement follows.

No provider, native CLI, terminal, project edit, Git, network, export or release
route is reachable from the product core. Native/provider and release gates stay
HOLD. Delegation reviews concern the supplied design only; final source acceptance
belongs to the parent. GPT-6 Luna/max and Flint completed; DeepSeek/max timed out.

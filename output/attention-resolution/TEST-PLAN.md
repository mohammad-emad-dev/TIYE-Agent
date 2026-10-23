# Explicit synthetic attention resolution — pre-execution review

23 October 2026

This is a bounded follow-up within the approved first-core 1B contract, which
requires a later explicit resolution command for attention. The owner requested
continued implementation. Phase 1A and 1B source/evidence remain frozen at their
qualifying commits. This is not an integration exception or new effect capability.

The parent reviewed changes in `effects-model.ts`, `effects-store.ts`, exports,
fixed `mock-host.cjs`, `resolution.test.cjs` and the shared mock test fixtures
before the first run. The unchanged
fixed witness/process supervisor/private-root allocator remain the only execution
composition. `preflight.json` pins actual source/test/compiled hashes, runtime
version and the installed dependency/prebuild hashes before execution. Corrections
require a new reviewed preflight. Public evidence contains verdicts and digests;
raw output stays local beneath `.git`.

## Command contract

The exact five-field resolution request binds a UUID command/effect/attempt,
positive safe-integer attention event sequence and one of two outcomes.
`confirm_completed` uses existing exact witness proof to mark task/effect completed;
`close_uncertain` records abandoned without asserting absence/completion. Neither
executes any mock action, creates an attempt or resets approval/claim state.

Invalid structure, proof encoding or proof/outcome coupling refuses before writes.
Well-formed semantic conflicts produce durable rejected decisions. Hashing and
proof encoding are specified in the [package contract](../../packages/core/README.md).
Reducer-derived attention sequences advance only on actual attention transitions,
and are removed when the effect leaves attention. Rejected commands and unrelated
events cannot stale a request. State, decision and events commit atomically.

The event cap reserves enough slots for approval/claim/outcome/explicit resolution
of admitted work. Rejection traffic cannot consume terminal capacity. Full-capacity
new admission refuses; exact committed redelivery continues. Older already-full
stores may remain unable to write; they are not repaired or automatically migrated.
Schema 2 tables are unchanged; old readers refuse the new `resolve` event type.

## Planned checks

- Existing 22 tests as regression coverage.
- Explicit uncertain closure, exact redelivery across reopen and no renewed claim.
- Confirmation from existing independent committed witness; no further invocation.
- Durable stale/unknown-effect/wrong-attempt/bad-proof rejection, stable attention
  identity, cross-command namespace conflicts and malformed input without writes.
- Unrelated task events do not invalidate the original attention sequence.
- Real SQLite near-limit fixture with validated rejection history proves reserved
  capacity permits a terminal resolution after other traffic refuses.
- Tampered resolution history refuses startup through replay/projection mismatch.
- Accepted closure, accepted confirmation and rejected resolution each crash
  immediately before/after SQLite COMMIT, then reopen in a fresh process and
  redeliver the exact command. At most one resolution event/decision persists.
- Witness row count stays one throughout confirmation recovery; action is not retried.

Children retain 10-second operation and 5-second verified owned-handle teardown
bounds. Databases are disposable local private roots allocated by the trusted
coordinator. The near-limit seed is real SQLite history, not a mocked reducer.
Only the SQLite SDK COMMIT boundary is instrumented in crash tests, outside core.

## Authority and limits

Proof is trusted fixture traffic from the fixed observer, not authenticated data
from an untrusted caller. No UI consent, account permission or provider behavior
is inferred. DeepSeek's suggestion to deduplicate the witness is rejected: it
conflicts with the explicit contract to expose every invocation. Resolution reads
existing proof and does not invoke an action. Other review feedback is addressed
through strict encoding, rejection boundaries and capacity reservation.

No providers, native CLIs, terminal, real project operations, Git, networking,
exports or release enter the product core. Full integration/release remains HOLD.
Migration, shared live task registry and team engine remain separate work.

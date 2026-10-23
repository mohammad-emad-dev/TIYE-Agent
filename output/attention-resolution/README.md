# Explicit synthetic attention resolution

23 October 2026 — internal Phase 1B follow-up

The core now accepts explicit fixture commands that close paused attempts without
dispatching them again. This implements the later-resolution requirement in the
approved first-core contract. It does not enable a production runner or team engine.

## Behavior

`attention(effectId)` returns the attempt and event sequence that put it into
attention. `resolve(request,proofBytes?)` provides two explicit outcomes:

- Confirm completion using an existing exact single-row witness observation.
- Close uncertainty as `abandoned`, preserving the ambiguous history.

Neither outcome reopens approval, creates an attempt or invokes the witness.
Malformed requests refuse before admission. Valid semantic conflicts record a
durable rejected decision. Exact redelivery returns the original decision;
changed payload/proof or cross-type command reuse refuses. The current attention
sequence binds the command to that attempt; unrelated tasks cannot stale it.

The event limit reserves terminal capacity for admitted effects. New traffic can
be refused at capacity while the explicit terminal resolution still commits.
There is no retention expansion or migration of older already-full stores.

## Review and verification

The [execution plan](TEST-PLAN.md) records parent source review before the first
run. [Preflight](preflight.json) pins the source/test composition, compiled files,
runtime version and previously reviewed installed SQLite files. [Verification](verification.json)
records build, import-boundary and real SQLite/process tests. Counts are sealed
from the retained TAP capture matching its recorded digest.

[Review](review.json) records three completed design reviews using GPT-6 Luna/max,
Flint 40B Free and DeepSeek V4.1 Flash Free/max. These are supplied-design reviews;
the parent owns final implementation review and gate execution. The proposed
witness deduplication was rejected because it would hide duplicate dispatch and
resolution never dispatches. Strict proof parsing, exact hash encoding, durable
rejection rules and reserved capacity address the relevant review findings.

Tests cover existing core regressions, uncertain closure, evidence-based
confirmation with unchanged witness count, stale/unknown/wrong-attempt rejection,
malformed proof without writes, unrelated task progress, capacity exhaustion,
tampered history refusal and fresh-process crashes before/after accepted closure,
accepted confirmation and rejected-resolution commits. Children retain 10-second
operation plus 5-second verified owned-handle teardown bounds.

Run `rtk proxy python -X utf8 -B output/attention-resolution/verify.py` from the
repository root to check the sealed hashes and frozen Phase 1A/1B historical
sources. This consistency check does not execute effects. Historical artifacts
are unchanged; their original source pins describe their qualifying revisions.
The old Phase 1B root README digest used Windows CRLF checkout bytes while Git
stored LF. The verifier reconstructs only that specific historical checkout for
its digest comparison. The current root README now has a byte-preserving Git
attribute so its source digest survives synchronization unchanged.
An explicitly reviewed rerun can build then run `capture.py`, which writes a new
preflight before execution and requires a new review/seal before publishing.
Raw test output and relay reports stay local; public records hold verdicts/digests.

## Scope limits and next work

Schema 2 tables are unchanged, but old Phase 1B readers refuse the unfamiliar
resolution event. Do not downgrade a database containing resolution history.
Fixture proof is trusted observer traffic; it is not authenticated user consent
or proof supplied by an untrusted party. Abandonment cannot revoke an issued
invocation. Power loss, hostile mutation and production ownership remain unqualified.

Next is review of schema convergence and the shared live task registry before
the team engine. No migration is implemented here. Providers, native CLI execution,
real project actions, Git, networking, exports and release stay outside the core.
Full native/provider integration and release remain **HOLD**.

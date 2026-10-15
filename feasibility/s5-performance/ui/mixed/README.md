# S5 event feed and search component

Reviewed 15 October 2026. This additive component prepares the feed/search
side of the mixed workload. It persists 50,000 public synthetic events in a
real SQLite WAL database with an FTS5 index, closes/reopens the database, and
checks the ordered row digest and index integrity. A separate Node process
owns SQLite; the Electron renderer requests bounded pages through narrow IPC.

**This is not the combined five-PTY hour run.** Events are inserted up front
in 50 transactions of 1,000 rows, then queried. Fixture timestamps are logical
counters, not elapsed test time. Continuous feed ingestion, scroll smoothness,
CPU/memory settling, core recovery and the product event engine remain
unqualified. Full S5 and production eligibility remain false.

## Native observations

[Corrected evidence](evidence.json) records:

| Measurement | Observation |
|---|---:|
| Persisted/reopened event count | 50,000 |
| Ordered digest, SQLite and FTS integrity | matched / ok / ok |
| Bulk insert loop, including batch construction | 177.06 ms |
| Known `needle` query, count plus first 20 rows | 2.29 ms |
| Search request to two RAF callbacks and DOM check | 16.10 ms |
| Last-page request to two RAF callbacks and DOM check | 18.70 ms |
| Maximum rows in the native viewport DOM | 20 |
| Superseded concurrent requests coalesced | 2 |

These are local single-run observations, not percentile estimates or a
search-under-hour-load pass. Query timing runs in the database worker and
includes count, statement preparation and page retrieval. Renderer timing
also includes IPC, DOM replacement and two RAF callbacks. The native probe
checks exact IDs and text inside the viewport bounds with a visible document
and native window; it does not prove physical display scanout or GPU FPS.

The native probe verifies the first page, last page, 50 known search matches
(first 20 displayed), empty search results, restored first page and latest
results after rapid requests. No more than 20 event row elements are created
at a time. Persistence is checked independently of the viewport's total count.
The initial [observation](evidence-initial.json) and complete measured
[source snapshots](snapshots/) are preserved. The corrected cohort additionally
checks WAL mode explicitly, uses shared bounded UTF8 frame decoding, retains
protocol errors through worker exit and coalesces obsolete UI requests.

## Storage and protocol boundaries

Events have increasing IDs/timestamps, one of five member numbers, a bounded
kind enum and text of at most 2,048 UTF8 bytes. Batch validation precedes the
transaction. Event rows and external-content FTS entries commit atomically;
SQL failures roll back both. Close checkpoints WAL before releasing the DB.
This fixture schema has no production migration/version/recovery contract.

Search accepts at most eight Unicode word tokens within 64 characters.
Each token is quoted literally for FTS; raw FTS/SQL operators are not exposed.
Queries are parameterized and ordered by event ID. Pages contain at most
50 rows in the store and 20 in the native viewport; offsets are capped at
50,000. Only the fixed public fixture is loaded by the worker.

The parent launches its trusted Node executable with fixed worker arguments
in a newly marked temporary root. Requests use increasing IDs; responses
must match pending requests. Frames are bounded to 4,096 bytes for requests
and 262,144 bytes for responses, with incremental UTF8 decoding, truncation
checks, at most two pending requests and a 15-second request timeout. Worker
exit or protocol failure rejects work; there is no restart or empty-result
fallback. The native host has a 60-second deadline.

Success cleanup waits for a closed database and exited worker, verifies the
canonical marked root and no-link inventory, then removes exact owned files
and directories. Failure preserves the root and prints its path. Abnormal
host crash cleanup remains unqualified. No vendor/model request, install,
service/configuration change or user-project database is part of this probe.

## Commands and prerequisites

Tested on native Windows with Node **26.7.0**, built-in SQLite **3.53.4** and
the existing S1 Electron **38.8.6** / esbuild **0.21.5** installation. No new
package is installed. Other Node/SQLite combinations are not qualified;
missing SQLite/FTS5 or failed WAL setup causes failure, with no fallback.

From this directory:

```powershell
rtk proxy npm run check
rtk proxy npm run build
rtk proxy npm run check:runtime
```

`check` verifies both evidence/source cohorts and runs six regression tests,
including real temporary SQLite databases, a transactional failure and a
real Node worker. `check:runtime` also compares the ignored current build
bytes. `rtk proxy npm run probe` refuses to overwrite `evidence.json` with
`Existing evidence preserved; no new launch`; further cohorts need preserved
evidence and source mappings. Failed runtime roots require ownership review
before cleanup.

## Review and next integration

Muse Spark 1.3 Free xhigh supplied a design review; it did not inspect code
or run checks. MiMo Atria timed out without output. Claude Atria xhigh failed
with connection refusal and an unrecognized-model diagnostic. Parent created
the files detected by Claude's read-only tripwire. Native artifact audits and
deliverable hashes are in [review-seal.json](review-seal.json). The protocol
and UI refinements were reviewed and verified by the parent.

The UI/UX review added visible labels, keyboard focus/scroll access and status
feedback. It is a benchmark surface rather than the product design.
The recorded [Agy consumer-route restriction](../../../s4-provider-access/antigravity-consumer/README.md)
still blocks fallback delegation.

Next: combine this feed worker/viewport with five live PTYs, sustained mixed
ingestion, grid/focus phases and existing resource sampling for an actual
hour-long cohort. That integration and its native hour evidence remain open;
the earlier terminal/resource cohorts stay byte-identical.

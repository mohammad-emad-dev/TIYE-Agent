# Bundled ConPTY mixed load and bounded settling — 16 October 2026

This additive native experiment repeats the existing eight-minute profile with
node-pty's experimental bundled ConPTY backend. It keeps the original profile
and memory criterion unchanged. All three delegated reviews completed before
launch. Earlier system-backend and bundled-backend evidence remains immutable.

## Recorded result

The native run completed in **484.58 seconds**, including final checks. Each
producer ran at least 180.191 seconds. The feed reached 50,000 verified/reopened
events; all 36 search/page checks matched. All five captured logs, recorded
main/renderer receipts, source/build hashes and backend binary hashes agree.
Active/idle resource coverage and marked-runtime cleanup completed. Four
regression tests passed.

The unchanged bounded memory criterion passed for all three retained roles.
Each had twelve in-window samples spanning 113.53 seconds, with a maximum gap
of 10.58 seconds. Tail-start private memory is context, not an absolute budget.

| Role | Tail-start private memory, MiB | OLS slope, MiB/min | Range, MiB | Bounded gate |
|---|---:|---:|---:|---|
| Main | 72.527 | +0.008 | 0.324 | Pass |
| Renderer | 58.414 | −0.103 | 0.566 | Pass |
| Feed | 32.137 | −0.043 | 0.066 | Pass |

Input results are separate: **focus failed the unchanged 100 ms maximum**,
with one 126.17 ms probe. No probe was skipped, exposure remained confirmed and
all 35 planned probes were delivered. This is a measured latency exceedance,
not missing coverage. No retry or adjusted threshold hides it.

| Proxy | Grid | Focus |
|---|---:|---:|
| Input probes completed / planned | 17 / 17 | 18 / 18 |
| Maximum dispatch → renderer ACK | 73.90 ms, pass | 126.17 ms, fail |
| Maximum RAF scheduling gap | 83.4 ms, pass | 166.8 ms, pass |

Maximum database search time was 4.03 ms; maximum request-through-DOM/RAF
completion was 166.90 ms. Both remain below the existing 2,000 ms bounds. These
are proxies, with no physical keyboard/paint or production performance claim.

The bundled run captured 28,411,199 decoded bytes for 127,882 producer records,
versus 12,188,067 bytes for 135,201 records in the earlier system-backend settling
run. These unpaired observations reinforce the decoded-volume/cost question;
they do not establish a causal regression percentage.

## Fixed protocol

Five isolated PTYs run for three minutes while SQLite ingests 50,000 events
incrementally and the renderer performs feed/search checks. The host then
retains main, renderer and feed worker for five minutes idle. Each PTY worker
records its loaded bundled DLL before the start barrier. Source, build and
backend binary hashes are saved before launch and checked afterward.

Elapsed time starts at the mixed-workload barrier, after initialization and
worker readiness. View phases last 30 seconds. Each 60-second output cycle has
a 20-second burst; these bursts fall in grid phases. Focus phases have quieter
output with continuing feed/search. This is not an equal-load view comparison.
Input scheduling remains every five seconds, without repeated focus stealing,
retrying skipped probes or relaxing visibility requirements.

The unchanged [memory gate](../settling/memory-gate.js) evaluates elapsed
**360,000–480,000 ms**, inclusively, in the final two planned idle minutes.
It uses private committed memory for main, renderer and feed, requiring each:

- At least ten present samples spanning at least 100 seconds
- No sampling gap above fifteen seconds
- Valid, nonnegative private-memory counters and no missing/reused role
- OLS slope at most 1 MiB/min and range at most 8 MiB

Invalid or incomplete coverage returns null; it is never a passing gate. Every
observed sample in the fixed window participates. No forced GC, substituted
working set, adjusted window or changed tolerance is used. The fixed gate can
pass slow positive drift or growth limited to the active phase. It cannot
establish leak freedom, a universal RAM budget or stability over hours.

## Integrity and artifacts

The native run compares each PTY capture/storage hash and main/renderer rolling
receipt chain. The independent checker rehashes the retained decoded logs and
checks recorded main/renderer chain agreement through the shared evidence
contract. Original chunk boundaries are not persisted by this harness, so the
checker does not claim to recompute those chunk-sensitive chains from the raw
log alone. The byte unit is decoded PTY strings re-encoded as UTF-8.

The [public output](../../../../output/s5-bundled-settling) retains module
observations, prelaunch hashes, host progress/diagnostic logs and losslessly
compressed PTY logs. Compression occurs after measurement and host exit, with
compressed and decoded hashes/lengths retained in `evidence-settling.json`.
The native result also retains resource arrays, feed/search results, input
coverage and the exact computed memory assessment.

The observer's arrays, terminal/feed state and minute-level progress logging
remain part of the measured overhead. There is no logging-quiescence or
post-GC-trough claim. CPU series use one-core interval percent; 100% represents
one logical CPU and is not a ceiling for a multithreaded process. Helpers,
OpenConsole and whole-machine resource use are outside the owned role roster.

## Commands and limits

With the existing S1 dependencies, from the repository root:

```powershell
rtk proxy node feasibility/s5-performance/ui/bundled-settling/check-evidence.js
rtk proxy node --test feasibility/s5-performance/ui/bundled-settling/test/evidence.test.js
```

After building the local bundles, `check-evidence.js --runtime` also verifies
their recorded hashes and those of the bundled DLL/OpenConsole binaries.
Probes refuse existing evidence/output. Dependencies, local bundles and runtime
profiles are ignored. Normal cleanup uses the existing canonical owner-marker,
allowed-file, no-link and single-hard-link checks. A native failure retains its
runtime; earlier failed runtimes are never removed by this experiment.

The unchanged shared [combined evidence contract](../settling/check-evidence.js)
verifies incremental ingestion, exact search IDs, feed digest/integrity/reopen,
recorded receipt agreement, input accounting and resource series. View/input
and rendered-search targets depend on full recorded exposure and delivery;
missing coverage stays unqualified. Memory-gate qualification is reported
separately. No physical paint, GPU frame rate, product-core, whole-tree cleanup,
full-hour workload, full-S5 or production qualification is implied.

Next: add correlation evidence for mixed-workload input dispatch, renderer
scheduling, feed work and sampling to isolate the focus-view spike before the
hour-long bundled-backend run. The current capture has latency arrays and
aggregate progress, without a per-probe timeline that establishes its cause.

## Delegation

Muse, Space Bunny and DeepSeek completed supplied-context reviews without tool
use or independent workspace verification. Advice on fixed-window scope,
positive drift, missing samples and immutable criteria informed the report and
negative tests. Suggested extra stop-marker/independent-observer and slope-error
analyses are not part of this predeclared gate and are not claimed. No criterion
was added after seeing the measurement. Parent implementation, native execution
and independent checks determine the result.

The requested GPT-6.1 Luna was not retried after the recorded account rejection.
The recorded consumer Agy route remains excluded. No credentials, protected
service or provider/model configuration was changed.

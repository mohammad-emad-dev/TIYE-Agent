# Independent input with view coordination — 16 October 2026

This separate corrected cohort retains the [first scheduled capture](../input-scheduled/README.md),
which the checker rejects because a view changed between dispatch and renderer
input handling. It uses the same absolute five-second deadlines, three-minute
active workload, ten-second drain, five bundled-ConPTY workers and incremental
50,000-event SQLite feed. Previous sources and captures remain unchanged.

## Recorded result

The corrected native run completed in 196.68 seconds. All 35 scheduled slots
were checked and all 35 inputs completed (19 grid, 16 focus), with no skips,
complete raw ACK/stage joins, full exposure and no view-label mismatches.
Due-to-dispatch lateness was 7.28 ms median and 14.70 ms maximum. Slot 12 queued
for view confirmation for 0.30 ms, retained within its original deadline.
All 50,000 events, 36 search/page checks, five PTY logs and recorded receipts
verify. Fifteen tests for this cohort and thirteen for the rejected cohort pass.

| Existing proxy | Grid | Focus |
|---|---:|---:|
| Maximum dispatch → render-notice arrival | 18.37 ms | 104.29 ms |
| Unchanged 100 ms bound | Pass | **Fail** |

Focus ordinals 10 and 21 exceed the bound. For the worst (21), the main-clock
partition is 56.87 ms dispatch-to-input notice, 1.01 ms input notice-to-ACK
ingress, and 46.41 ms ACK ingress-to-render notice. Its worker-local command-to-ACK
interval is 0.33 ms; renderer write-callback-to-render-event interval is 46.00 ms.
A feed append overlaps the probe, with no recorded main timer-lateness overlap
or already-delivered renderer long-task entry. These observations do not identify
the cause; delayed observer delivery remains possible.

RAF and search proxies pass their existing bounds. Short-drain idle resource
coverage remains insufficient. No probe's complete dispatch-to-render interval
overlaps a recorded search span, so this native run does not establish input
responsiveness during a pending search. The independent scheduler is exercised
against unresolved async work in the deterministic test, with native search
overlap still requiring a deliberately controlled cohort.

The view race is prevented by the new coordination in this observed run; this
does not establish general reliability or resolve the earlier input delay.
Next: a controlled native search-overlap test and further localization of the
dispatch/input/render delays before the bundled hour-long performance gate.

## View coordination

Before mutating the view, the workload loop waits for an outstanding input's
render-notice ACK. During an in-flight view change, the scheduler queues at most
one due input. Dispatch follows renderer confirmation and the parent view update.
Its original slot/deadline/check time and view-wait start/end remain recorded.
An additional queued input or an actual dispatch outside its slot fails explicitly.

This coordination applies to views only. Input scheduling does not await feed or
search operations. The scheduler and view helper run on the main event loop and
cannot bypass synchronous blocking. View mutation can delay workload-loop work,
and view confirmation can delay input dispatch. Neither delay is omitted from
the relevant traces. Per-view acceptance still requires dispatch and renderer
input labels to agree for every probe; mismatches are rejected, never filtered.

The worker, parent pipe, renderer and raw-ACK correlation contract is retained
from the [worker trace](../input-worker-trace/README.md). Fixed deadlines and
explicit miss/skip accounting follow the [scheduled diagnostic](../input-scheduled/README.md).
The 100 ms dispatch-to-render-notice target is unchanged. Due-to-dispatch lateness
is a separate metric without a newly invented target. No cross-clock subtraction
or physical-paint measurement is performed.

## Evidence and checks

[Native result](evidence-trace.json), [derived analysis](analysis.json) and
[logs/output](../../../../output/s5-input-scheduled-views) retain this run.
Prelaunch/post-exit source and binary hashes, observed DLLs, raw decoded log
hashes and lengths, contiguous ACK ordinals, renderer receipts and feed integrity
remain required. Original chunk boundaries are not independently reconstructable
from concatenated logs. Compression occurs only after measurement.

With the existing S1 dependencies, from the repository root:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-scheduled-views/check-evidence.js
rtk proxy node --test feasibility/s5-performance/ui/input-scheduled-views/test/*.test.js
```

The checker accepts `--runtime` to verify local recorded bundles/binaries. The
runner refuses existing evidence/output; failures retain marked runtime files.
Normal cleanup validates ownership and inventory. Whole process-tree cleanup,
memory settling, an hour-long mixed run, full S5 and production remain unqualified.

The first and corrected attempts are unpaired observations with changed input
phase and view coordination. No performance improvement percentage, causal fix,
or reliability claim follows. Instrumentation overhead remains uncalibrated.
The shared supplied-context delegate work is recorded with the first cohort;
the parent implemented and tested the view-race correction after native failure.

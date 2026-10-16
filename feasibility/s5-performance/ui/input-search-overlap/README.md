# Controlled input during a pending search — 16 October 2026

The preceding [scheduled/view-coordinated run](../input-scheduled-views/README.md)
had no input interval overlapping a recorded search span. This additive cohort
deliberately creates that condition without changing earlier evidence.

## Recorded result

One native run completed in 200.49 seconds, including drain and final checks.
All 35 planned input probes completed (18 grid, 17 focus), with no skips, full
exposure and matching view labels. Every full main-clock input interval is
contained in its corresponding outer search and controlled response-wait span.
All 35 real page queries begin after barrier release. The initial unheld search
is separately tagged. No watchdog fired. All 50,000 feed events, 36 search/page
checks, five terminal captures and recorded receipts verify. Nineteen tests pass.

| Existing input proxy | Grid | Focus |
|---|---:|---:|
| Maximum dispatch → render-notice arrival | 27.81 ms | 109.08 ms |
| Unchanged 100 ms bound | Pass | **Fail** |

Focus probe 21 exceeds the bound. Its main-clock partition is 0.64 ms dispatch
to input notice, 104.69 ms input notice to ACK ingress, and 3.75 ms ACK ingress
to render notice. Parent command-write start to stream callback takes 102.96 ms.
The separate worker-local command-handling-to-ACK interval is 1.43 ms. These
timestamps do not isolate command delivery, worker scheduling before handling,
OS pipe behavior or parent callback handling. No recorded main timer-lateness
span overlaps the probe, and no already-delivered renderer long-task entry is
reported for it; neither observation rules out blocking or delayed delivery.

Due-to-dispatch lateness has a 7.09 ms median and 15.12 ms maximum. Actual barrier
arming leads are 671.12–745.07 ms, and recorded response holds last 709.57–793.43 ms.
Search request-to-RAF maximum is 845.60 ms, including the deliberate hold;
actual SQLite query maximum is 5.56 ms. RAF/search proxies pass their existing
bounds. Short-drain idle resource coverage remains insufficient. No causal fix,
ordinary search-performance result, memory/hour or full-S5 qualification follows.

Next: a controlled parent-to-worker transport comparison to investigate the
long pipe-write interval before proceeding to the bundled hour-long gate.

## Controlled condition

One normal search runs at startup. Then 35 controlled searches are scheduled
750 ms before the absolute five-second input deadlines, through slot 35 at
175 seconds. The renderer awaits its real page IPC request. The main handler
holds that response asynchronously until the matching terminal render-notice ACK
arrives, with a 3,000 ms watchdog. Only after release does the real SQLite page
query run, followed by exact row/content checks, DOM checks and two RAF callbacks.

The pending search must not prevent input delivery, terminal output/ACK handling
or renderer input rendering. A timeout, late arm, orphan/wrong/duplicate release,
missing input, view mismatch or incomplete span invalidates the run. Timeouts
retain failed state and reject; they do not release the response successfully.
The checker accepts no filtered or silently skipped controlled inputs.

This is an intentional asynchronous page-response wait, not a slow SQLite query
or synchronous CPU-blocking search. Containment is designed into the fixture;
its information is whether input actually completes, how long its independent
path takes, and whether real query/DOM checks resume in the required order.
It cannot locate or resolve the earlier 100 ms focus-latency failures.

## Retained workload and timing

Five bundled-ConPTY workers run the same three-minute active producer waveform
with an incremental 50,000-event feed and ten-second drain. Fixed input deadlines,
single-outstanding correlation and view coordination are retained. Holding search
also holds this workload loop, so append/view timing can shift. This is a changed
experimental workload, not a paired performance comparison with earlier runs.

Input still uses the unchanged 100 ms main-dispatch-to-render-notice bound.
Barrier and containment timestamps use the same main monotonic clock. Worker
and renderer durations use their own clocks; no cross-clock subtraction occurs.
Search request-to-RAF includes the deliberate hold and is not an ordinary search
latency benchmark. Actual query time is reported separately. Render/RAF events
are application proxies, not physical paint or compositor frame-drop measures.

## Evidence and checks

[Native result](evidence-trace.json), [derived analysis](analysis.json) and
[captured output](../../../../output/s5-input-search-overlap) retain all samples.
Prelaunch/post-exit source/bundle/backend hashes, observed worker DLL paths,
independent decoded-log hashes/lengths, contiguous raw ACKs, main/renderer
receipts and SQLite/FTS/reopen integrity remain required. Original chunk
boundaries are not independently reconstructable from concatenated log files.
Logs are compressed only after measurement. Instrument overhead is uncalibrated.

From the repository root, using the existing S1 dependencies:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-search-overlap/check-evidence.js
rtk proxy node --test feasibility/s5-performance/ui/input-search-overlap/test/*.test.js
```

The checker accepts `--runtime` for local recorded bundles/binaries. The native
runner refuses existing evidence/output and retains failed runtime files.
Ownership/inventory checks govern normal cleanup. Whole process-tree cleanup,
memory settling, an hour-long mixed workload, full S5 and production remain open.

## Delegation

Muse supplied the barrier draft; the parent adapted it to retain all bounded
records, prohibit continuation after timeout, record both ACK/release stamps,
check release deadlines and suppress stale timeout callbacks. Space Bunny and
DeepSeek supplied reviews; all three used supplied context without tools or
independent workspace verification. Their async-wait and fixture-containment
limits were retained. Suggestions to silently tolerate duplicate/wrong releases
were rejected. Space's stale-filter scenario and asserted synchronous-query root
cause are unsupported here; input goes to the terminal, and exact fixture rows
are checked. Its cross-clock-skew objection does not apply to main-to-main timing.
The requested Codex model remains unsupported on this account; the recorded Agy
consumer route remains excluded. No service, route or credential settings changed.

# Independent input scheduling — 16 October 2026

This additive diagnostic separates input deadlines from the async loop that
awaits feed append, search and view changes. It retains the previous cohort's
three-minute active waveform, five bundled-ConPTY PTYs, incremental 50,000-event
SQLite feed, ten-second drain and main/worker/renderer stage tracing.
Earlier evidence, including the 128.32 ms focus failure, stays unchanged.

## Failed native cohort

The native run completed in 196.38 seconds with 35/35 probes and no focus skips,
but the checker **rejects per-view qualification**. At slot 6 (30 seconds), the
main dispatch label was grid and the renderer input label was focus. An input
can be in transit while a later view change executes; a transition flag sampled
only at dispatch does not prevent or fully identify this race. No sample is
removed or relabeled in the capture. The expected rejection is regression-tested;
running the native checker still exits nonzero for this reason.

All 35 fixed deadline checks are retained. Observed due-to-dispatch lateness was
7.07 ms median and 15.32 ms maximum. Probe 19, whose focus labels agree, exceeded
the unchanged 100 ms bound at 117.10 ms. Its main pipe-write completion interval
was 108.00 ms, while its worker-local command-to-ACK interval was 0.39 ms. Those
separate-clock observations do not locate the cause. No input probe's complete
dispatch-to-render interval overlapped a recorded search span in this run.
It therefore supplies no native sample of input dispatch during a pending search.

Feed integrity, 36 search/page checks, raw ACK ordinal joins, source/binary hashes
and five PTY captures validate before the view check rejects the run. Thirteen
regression tests pass, including preservation of this expected rejection.
The [corrected cohort](../input-scheduled-views/README.md) coordinates view changes
with outstanding input and retains these failed artifacts unchanged.

## Scheduling contract

A separate main-process timer uses absolute due times 5,000, 10,000, …, 175,000 ms
after the active start barrier. Each callback records its slot, due time and
check time. It calls input dispatch without awaiting the workload loop. Timers
that fire early are rearmed; deadlines never drift from actual dispatch time.

An entire missed five-second slot, expiry of the active input window, or a
second outstanding probe fails explicitly. No catch-up burst occurs. A normal
run must account for all 35 slots as dispatched or explicitly skipped because
the window lacked focus. Skips do not count as completed probes. Stopping or
failure cancels further scheduling and suppresses stale callbacks.

The checker reconciles scheduled checks with probe/skip records, validates the
fixed deadlines, and requires renderer input-view labels to match dispatch-view
labels before accepting per-view results. View changes remain serialized in the
workload loop; their spans and the transition flag at dispatch are retained.
Inputs are not suppressed to avoid transitions. A mismatch is a validation
failure, not a sample to discard.

The timer shares the main event loop and cannot bypass synchronous blocking.
The original 100 ms bound still measures main dispatch to render-notice IPC
receipt. Due-to-dispatch lateness is reported separately, with no new target.
All derived durations stay within their process's monotonic clock domain.

## Evidence and limits

[Native result](evidence-trace.json), [derived analysis](analysis.json) and
[output/logs](../../../../output/s5-input-scheduled) retain each observation.
Executed sources, bundles and backend binaries are hashed before launch and
checked after exit. Loaded DLL paths are observed per worker. Captured logs are
compressed after measurement, then independently decoded and rehashed; recorded
main/renderer chunk receipts must agree. Original chunk boundaries cannot be
independently reconstructed from concatenated logs.

This changes both await coupling and input phase: the old scheduler drifted,
while this one is anchored. Input can now overlap awaited work or arrive before
it starts. One unpaired run cannot establish a causal speedup, regression
percentage, reliability, or resolution of earlier latency failures. Instrument
overhead is uncalibrated. Renderer events/RAF are application proxies, with no
physical-paint or dropped-frame measurement. Short-drain memory settling,
hour-long behavior, whole process-tree cleanup and full S5 remain unqualified.

With the existing S1 dependencies, from the repository root:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-scheduled/check-evidence.js
rtk proxy node --test feasibility/s5-performance/ui/input-scheduled/test/*.test.js
```

The checker accepts `--runtime` for recorded local bundles/binaries. The native
runner refuses existing output/evidence; failed runtimes are retained. Normal
cleanup validates the owner, canonical parent, links, file types and inventory.

## Delegation and review

Muse supplied a scheduler draft; the parent adapted it to bound allocation before
building the deadline list, retain failed dispatch attempts, copy snapshots and
surface errors. Space Bunny and DeepSeek supplied reviews. All calls used supplied
context without independent workspace verification. Parent implementation and
gates determine the result. Their phase/overhead/view-correlation caveats were
retained. Space Bunny's incorrect ten-second/17-slot assumptions and renderer
timer-throttling attribution do not describe this main-process Node timer.
DeepSeek's cross-clock-skew objection does not apply to main-to-main timing;
worker/renderer durations still use their own clocks exclusively.

The exact requested Codex model remains unsupported on the current account;
the recorded consumer Agy route remains excluded. Authorized free fallbacks
were used without route, service, authentication or credential changes.

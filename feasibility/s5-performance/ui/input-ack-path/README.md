# Worker and producer ACK-path trace — 16 October 2026

The [transport comparison](../input-transport/README.md) found slow worker-local
ACK intervals under both routes and did not establish a transport fix. This
additive diagnostic retains the pipe route and adds bounded event-loop and
producer-write observations. Earlier captures and sources remain unchanged.

## Recorded result

The native run completed in 198.07 seconds. All 35 input probes completed (18
grid, 17 focus), with no skips, matching raw ACK/worker/producer ordinals and
complete chronological producer stages. Both diagnostic files reconcile exactly
with the embedded result and artifact hashes. All 50,000 events, 36 page/DOM
checks, five terminal captures and 35 controlled search-overlap intervals verify.
Twenty-seven tests pass, including independent clock-origin shifts and missing
or invalid diagnostic rejection.

| Observation | Recorded value |
|---|---:|
| Grid dispatch → render-notice maximum | 16.75 ms |
| Focus dispatch → render-notice maximum | **192.02 ms — fails 100 ms** |
| Worker timer ticks / retained late ticks | 6,349 / 17 |
| Producer timer ticks / retained late ticks | 6,217 / 37 |
| Maximum producer input → write callback | 0.98 ms |
| Producer writes returning false | 0 / 35 |

Focus probe 31 exceeds the input bound. Its main-clock stages are 0.64 ms
dispatch-to-input notice, 189.56 ms input notice-to-ACK ingress, and 1.82 ms ACK
ingress-to-render notice. The parent send callback takes 0.11 ms. Its separate
worker-local command-to-ACK interval is 0.37 ms; producer-local input-to-write
callback is 0.08 ms. The short local intervals do not explain the main interval,
and no subtraction between them identifies transport or scheduling latency.

No retained worker/producer timer gap overlaps those short local intervals.
Globally, the largest retained gaps are 206.08 ms worker and 206.12 ms producer;
they are not attributed to this probe. Their clock domains are distinct. Final
unobserved timer tails are 16.34 ms worker and 30.66 ms producer. Main/renderer
timer observations also do not establish a cause. RAF/search proxies pass their
existing bounds; short-drain idle resource coverage remains insufficient.

The input latency gate remains failed. Next: add main-clock observations of
worker command-receipt notices and a controlled-delay check to narrow the
unobserved delivery/notification interval without cross-clock assumptions.

## Instrumentation

Member 0's worker and producer each observe a 20 ms interval timer on their own
event loop and `performance.now()` clock. A gap is retained when the observed
tick is at least 20 ms later than the previous observed tick plus the period.
Ticks are counted; gaps are capped at 1,000 and overflow fails, without eviction
or invented catch-up counts. Start, last-tick, stop and the final unobserved tail
are retained. A timer gap is an observation of delivery lateness, not a CPU cause.
An empty gap list does not rule out scheduling delay or native/OS/other-loop stalls.

The producer records all 35 probe ordinals at entry to its `x` handler branch,
before constructing ACK text, then records write start, synchronous return and
`stdout.write` callback. The original terminal ACK bytes and flood records remain
unchanged. The write's boolean return is retained: false means backpressure,
not rejection, and its callback is still required. True does not prove OS or
worker receipt. The callback is API completion, not terminal display.

All diagnostic rows stay in memory during active work. At the end of the
three-minute producer workload, the producer saves `s5-producer-0.json`; the
worker saves `s5-worker-0.json` on terminal exit. Both files join the owned runtime
inventory and public artifact manifest with byte lengths and hashes. Abrupt
process death can lose these in-memory diagnostics; this is not crash-trace
persistence qualification.

The runner embeds the sidecar contents after exit, and the checker requires exact
agreement with the hashed files. Producer ordinals, raw terminal ACKs and worker
records must reconcile 1–35. Every producer stage must be present, chronological
and within its loop-observation bounds. Worker stages must also be covered by
the worker's loop trace. Gap overlap is computed only in that process's clock
domain. Worker and producer intervals are reported separately, never subtracted
across processes or summed into a latency decomposition.

## Workload and evidence

The same three-minute five-PTY waveform, incremental 50,000-event SQLite feed,
35 independent input deadlines, view coordination, 35 deliberate pending-search
response holds and ten-second drain remain. The 100 ms main dispatch-to-render
notice target is unchanged. Extra timers/stamps can perturb this diagnostic;
overhead is uncalibrated, with no minimal-observer control or causal comparison.
Controlled holds are async response waits, not synchronous SQLite contention.
Renderer/RAF callbacks do not measure physical paint or dropped frames.

[Native result](evidence-pipe.json), [analysis](analysis-pipe.json) and
[captures and sidecars](../../../../output/s5-input-ack-path-pipe) retain the run.
Executed sources/bundles/backend binaries are hashed before launch and checked
after exit; worker-loaded DLLs are observed. Raw decoded logs are independently
rehashed, with required main/renderer receipt agreement. Original chunk boundaries
cannot be independently reconstructed from concatenated logs. Compression occurs
after measurement. Normal cleanup verifies owner, canonical parent and inventory.
Whole process-tree cleanup, memory settling, hour-long behavior and full S5 remain
unqualified.

From the repository root, using the existing S1 dependencies:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-ack-path/check-evidence.js pipe --runtime
rtk proxy node --test feasibility/s5-performance/ui/input-ack-path/test/*.test.js
```

Without `--runtime`, recorded source/artifact/semantic checks still run; local
bundles/binaries are additionally checked with that flag. The runner refuses
existing output/evidence and retains failed runtime files.

## Delegation

Muse supplied a plan rather than code; the parent implemented the helpers.
Space Bunny and DeepSeek reviewed supplied context. All three used no tools or
independent workspace verification. Useful completeness, observer-effect and
timer blind-spot caveats were retained. Suggested ring eviction, omission of
callbacks after false returns, ungrounded formulas and causal claims from presence
or absence of timer gaps were rejected. The worker is a separate child process.
The requested Codex model remains unsupported on this account; the recorded Agy
consumer route remains excluded. No route, service or credential settings changed.

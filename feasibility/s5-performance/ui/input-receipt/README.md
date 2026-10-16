# Main-clock worker receipt notices and positive control — 16 October 2026

The preceding [ACK-path diagnostic](../input-ack-path/README.md) retained a
192.02 ms input sample with short worker-local and producer-local intervals.
This additive cohort observes worker command-notice arrival on the main clock
and declares one deliberate pre-write delay to check the instrument.
Earlier captures remain unchanged.

## Recorded result

The native run completed in 197.49 seconds. All 35 probes, receipt notices,
matching raw worker command stamps, sidecars, route/view joins and controlled
search intervals verify. All 50,000 events, 36 page/DOM checks and five PTY
captures reconcile. Thirty-two tests pass.

| Explicit population / control | Recorded result |
|---|---:|
| Positive control, ordinal 7: configured minimum | 120 ms |
| Control: worker command → write start | 122.26 ms — criterion met |
| Control: main dispatch → render-notice arrival | 125.19 ms — expected breach |
| All 35: input ordinals over unchanged 100 ms | 6, 7, 20 |
| Ordinary-only: count / over-bound ordinals | 34 / 6, 20 |
| Ordinary-only: median / maximum | 14.33 ms / **255.20 ms** |

The ordinary latency target still fails. For ordinary probe 20, main send start
to receipt-notice arrival is 247.19 ms, followed by 1.11 ms to stdout ACK ingress.
Its separate worker-local command-to-ACK interval is 247.78 ms, and producer-local
input-to-write-callback interval is 0.41 ms. These are not additive components
of one shared timeline. The notice can be delayed after the worker handled
the command; no precise delivery/receipt latency is inferred.

Notice 35 arrives after its stdout ACK; the order flag is false and the
post-notice interval is null. That ordinary input completes in 79.91 ms.
This directly exercises the independent-channel order case in the native run.
No samples are dropped. Producer and worker loop traces retain 58 and 49 late
ticks respectively. Their presence/absence does not establish the cause of the
ordinary failures. RAF/search proxies pass; short-drain idle coverage is still
insufficient. Full S5 and product performance remain unqualified.

Next: isolate the producer/PTY bridge with a declared direct-pipe control,
retaining the measured application endpoints and preserving these failures.

## Observation and control

On each probe, the worker records command entry and sends a `probe-command-received`
IPC notice with that raw worker stamp and ordinal. It records return from the
send call before the PTY write starts. Later ACK metadata must carry the identical
command-entry stamp. The main independently records receipt of the notice, checks
the route/policy and joins all 35 notices to raw ACKs, worker stages and views.

Main send-start-to-notice-arrival is an observed round-trip interval that includes
delivery, worker handling, notification transport and main handling. It does not
identify the worker's command-entry instant on the main clock. IPC and stdout
can arrive in either order. A notice arriving after an ACK is retained with a
false order flag and a null post-notice-to-ACK interval; it does not create a
negative processing-latency claim. No cross-clock timestamps are subtracted.

**Positive control: ordinal 7 only**, declared in the profile before launch,
waits at least 120 ms on an asynchronous worker timer before its PTY write.
Early timer callbacks rearm against the same worker deadline; invalid clocks
fail rather than releasing early. The checker requires worker command-to-write
start to include at least 120 ms and the main application interval to exceed
100 ms. The delay is cooperative waiting, not a simulated CPU-blocked loop.
Ordinals remain serial, and none may silently overtake or duplicate the control.

All 35 samples, including the expected control breach, remain in the unchanged
100 ms main-dispatch-to-render-notice report. The 34 non-injected samples are
also explicitly summarized as ordinary-only. They share the same instrumented
process lifetime and are not an independent baseline. Neither summary qualifies
the product or resolves earlier failures. No threshold is adjusted after results.

## Workload and evidence

The pipe route, three-minute five-PTY waveform, incremental 50,000-event feed,
fixed input schedule, view coordination, 35 held-search intervals, worker/producer
loop traces and producer write stages remain. Sidecars persist after active work;
abrupt process death can lose their in-memory diagnostics. New notices and timers
have uncalibrated overhead. Controlled search holds are async waits, not synchronous
SQLite contention. Renderer events do not measure physical paint or frame drops.

[Native result](evidence-pipe.json), [analysis](analysis-pipe.json) and
[logs and sidecars](../../../../output/s5-input-receipt-pipe) retain every sample.
Prelaunch/post-exit source and binary hashes, loaded DLL observations, decoded
log hashes/lengths, main/renderer receipts, SQLite integrity, complete ordinal
joins and sidecar equality remain required. Concatenated logs do not independently
reconstruct original chunk boundaries. Compression occurs after measurement.
Normal cleanup validates the owner and inventory; failures retain marked runtimes.
Memory/hour/full-S5, process-tree cleanup and production remain unqualified.

From the repository root, using the existing S1 dependencies:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-receipt/check-evidence.js pipe --runtime
rtk proxy node --test feasibility/s5-performance/ui/input-receipt/test/*.test.js
```

`--runtime` additionally checks recorded local bundles and backend binaries.
The runner refuses existing evidence/output.

## Delegation

Muse supplied a delay-helper draft, adapted to reject invalid clocks instead of
silently writing. Space Bunny and DeepSeek reviewed supplied context without
tools or independent workspace verification. Stamp equality, notice ordering and
control-label caveats were retained. Suggestions to change the target when ordinary
samples fail, or equate main notice-to-ACK with worker processing, were rejected.
The parent implemented, ran and checked the cohort. The requested Codex model
remains unsupported on the current account; the recorded consumer Agy route
remains excluded. No service, auth or credential settings changed.

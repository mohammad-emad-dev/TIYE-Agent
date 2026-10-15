# Worker-local input trace — 16 October 2026

This additive diagnostic extends the [previous trace](../input-trace/README.md)
with worker-local command/write/ACK timestamps and parent pipe-write completion.
It keeps the serial search-before-input scheduler, three-minute active workload,
five bundled-ConPTY PTYs, incremental 50,000-event feed and ten-second drain.
Previous captures and the historical 126.17 ms focus failure remain unchanged.

## Recorded result

One native run completed in 199.08 seconds, including drain and final checks.
All 35 planned probes completed (17 grid, 18 focus), with no skips and full
exposure. All 35 parent control callbacks and worker timing packets reconcile
with raw ACK ordinals, renderer stages and single-outstanding checks. Five PTY
captures, all 50,000 feed events and 36 search/page checks verify. Nine tests pass.

**The focus input target fails again:** ordinals 10 and 22 took 128.32 ms and
100.27 ms respectively. Grid maximum was 19.25 ms. RAF and search proxies pass;
short-drain idle resource coverage remains insufficient. Full S5 remains open.

The slowest probe, focus ordinal 10, has these separate-clock observations:

| Clock domain and observed interval | Duration |
|---|---:|
| Main: dispatch → input notice | 2.45 ms |
| Main: input notice → ACK ingress | 51.73 ms |
| Main: ACK ingress → render notice | 74.14 ms |
| Main: command-write start → pipe callback | 0.10 ms |
| Worker: command handling → ACK observation | 0.39 ms |
| Worker: write return → ACK observation | 0.34 ms |
| Renderer: write callback → render event | 73.30 ms |

Its worker write call took 0.05 ms. The short worker interval does not locate
the remaining upstream delay: command delivery, scheduling before worker command
handling, stdout delivery and parent handling are not individually measured.
The renderer interval is also an application event interval, not physical paint.
An append operation overlapped this probe; no recorded main timer-lateness span
or already-delivered renderer long-task entry did. Absence of such entries does
not rule out blocking or delayed observer delivery. No causal attribution follows.

The largest scheduling wait was 557.28 ms before focus probe 22, co-occurring with
append/search/feed-page spans. Its dispatch-to-render notice then took 100.27 ms.
The serial scheduler remains an independently identified harness limitation.
Worker IPC arrived before stdout ACK ingress for 33 probes and after it for two;
both orders are accepted and recorded. This recurrence exceeds the same bound
as the older failure; it does not establish that their root causes are identical.

## Timing contract

The parent records command-write start and the stdin write completion callback
on its main monotonic clock. The callback observes completion of the stream
write operation; it does not establish worker receipt or producer consumption.
It can arrive after ACK ingress. Both timestamps are retained independently.

The worker records command handling, write start, synchronous write return and
complete ACK-marker observation on its own monotonic clock. It emits one timing
packet after the ACK. Derived worker durations use only these worker timestamps.
The write-return-to-ACK interval includes producer/ConPTY behavior, output
delivery, worker scheduling and marker fragmentation. It does not isolate them.

The main process independently stamps receipt of that IPC packet. IPC and stdout
can arrive in either order. The checker requires per-domain chronology, complete
ordinal joins and one outstanding probe, without requiring cross-channel order.
No timestamp is subtracted across clock domains. No one-way control-delivery
latency can be computed from these unsynchronized clocks.

ACK parsing requires the complete decimal ordinal and trailing ESC8, scans each
whole incoming chunk before retaining a bounded suffix, and rejects unknown or
duplicate complete ACKs. Native raw ACKs must reconcile with every input ordinal.
An overlapping input probe fails explicitly instead of silently losing identity.

## Evidence and limitations

[Native output and compressed logs](../../../../output/s5-input-worker-trace),
[native result](evidence-trace.json) and [derived analysis](analysis.json) retain
the observations. Executed sources, local bundles and backend binaries are
hashed before launch and checked after exit; loaded DLLs are observed per worker.
Post-measurement compression preserves decoded hashes and lengths. Main/renderer
chunk receipts must agree; original chunk boundaries are not independently
reconstructable from the concatenated logs.

This is a short diagnostic, with uncalibrated instrumentation overhead. It does
not qualify memory settling, an hour-long mixed run, physical paint, dropped
frames, whole process-tree cleanup or production readiness. The original 100 ms
dispatch-to-render-notice bound remains separate from due-to-dispatch wait.
Neither a faster rerun nor co-occurring operations establish a causal fix.

With the existing S1 dependencies, from the repository root:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-worker-trace/check-evidence.js
rtk proxy node --test feasibility/s5-performance/ui/input-worker-trace/test/*.test.js
```

The checker accepts `--runtime` to verify local recorded bundles and binaries.
The native runner refuses to overwrite existing evidence/output. Failure retains
the marked runtime; normal cleanup checks owner, canonical parent and inventory.

## Delegation

Muse supplied the worker helper draft, adapted by the parent to fix decimal
ordinal extraction and scan before suffix truncation. DeepSeek's clock and
channel-order review informed interpretation. Space Bunny timed out without a
final report. These were supplied-context calls, with no independent workspace
verification. Parent implementation and gates determine the result. The exact
requested Codex route remains unsupported on the current account; the recorded
consumer Agy route remains excluded. No route or credential configuration changed.

Next: isolate input scheduling from awaited feed/search work in a separate,
declared cohort, then reconsider the bundled hour-long performance gate.

# Mixed-input stage trace — 16 October 2026

**The earlier 126.17 ms focus spike did not recur in this diagnostic run. Its
cause remains unresolved and the earlier failure stays unchanged.**

This additive instrument runs the same three-minute active waveform with five
bundled-ConPTY PTYs and incremental 50,000-event SQLite/feed/search activity,
then ten seconds of drain. It is not another memory-settling or hour-long run.
All delegated reviews completed before measurement. No product fix is claimed.

## Recorded observation

The run completed in 195.77 seconds, including drain/final checks. All 35 planned
probes completed (17 grid, 18 focus), with full exposure, no skips and one probe
outstanding at a time. Every probe has all main stages, the matching renderer
chunk stages and a worker write-call notice. Raw terminal ACK ordinals 1–35
reconcile with those traces. All 50,000 events, 36 search/page checks, five PTY
captures and recorded main/renderer receipts verify. Five regression tests pass.

| Existing proxy | Grid | Focus |
|---|---:|---:|
| Maximum dispatch → render-notice IPC arrival | 19.34 ms | 75.30 ms |
| Under unchanged 100 ms bound in this run | Yes | Yes |

RAF and search proxies also pass their existing bounds. The short drain does
not provide the earlier idle-coverage minimum; `resourceIdleCoverage=false` is
retained. Memory/hour/full-S5 and production flags remain false. The instrument
is diagnostic even when its observed latency maxima are below the target.

The slowest probe was focus ordinal 6. Its main-clock partition is:

| Main-process observed interval | Duration |
|---|---:|
| Dispatch → renderer-input IPC notice received | 2.61 ms |
| Input notice → complete PTY ACK marker observed | 64.59 ms |
| ACK ingress → renderer-render IPC notice received | 8.10 ms |

Its renderer-local write callback interval was 0.20 ms, followed by 7.60 ms to
the xterm render event. The worker's `terminal.write` call took about 0.06 ms.
The 64.59 ms main-clock interval includes command delivery, worker scheduling,
producer/ConPTY output and parent handling; it does not isolate those components.
No sampled main timer-lateness span overlapped this probe. The renderer supplied
no already-delivered long-task entry for it; this does not prove no blocking or
unreported long task occurred. None of these observations explains the historical
126.17 ms spike retroactively.

There is also a scheduling issue in the harness: focus probe 33 was dispatched
320.84 ms after its recorded due time, while search/feed-page operations were
open. The source awaits feed/search work before checking input scheduling.
This is separate from dispatch-to-render ACK latency, which starts at dispatch;
the old 100 ms target has not been redefined to include that wait.

## Clock and correlation contract

- Main uses `performance.now()` relative to the active start barrier for due,
  dispatch, input IPC receipt, complete ACK ingress, worker-notice receipt,
  render IPC receipt and operation/timer spans.
- Renderer timestamps use its own `performance.now()` for onData, ACK-bearing
  chunk receipt, queued work, hash completion, xterm write callback and render
  event. Durations are computed only within that domain. Quantized zero values
  are not proof of zero work.
- Worker reports the duration of its `terminal.write` call on its own clock.
  The parent stamps notice arrival on the main clock. This is not proof of
  when the producer received the input.

No timestamp from one process is subtracted from a different process's clock.
The valid main-to-main dispatch/render-notice interval remains an end-to-end
application proxy. Physical paint, compositor/DWM presentation and frame drops
are not measured. A render event or RAF callback is not a physical-paint boundary.

Probe ordinals follow the existing one-at-a-time synthetic input sequence and
are carried through the existing renderer/control payloads. They are not an ID
encoded into the OS key event itself. Completed counts, contiguous ordinals,
raw ACKs and no overlapping outstanding probes must reconcile before stage
correlation is accepted. Incomplete input delivery cannot silently become a
valid trace. Worker notice and stdout arrive on different channels; their
arrival order is not assumed. A split ACK waits for its full decimal ordinal
and restore sequence, rather than matching a shorter ordinal prefix.

Main operation intervals cover append, feed page, rendered search and sampling.
The classifier reports overlap, endpoint contact, unknown clocks/data and open
spans distinctly. Both pre-dispatch and post-dispatch co-occurrences are retained.
Overlap is not causal attribution. Main timer observations use a 20 ms timer
and retain lateness spans of at least 20 ms. Renderer long-task support and
already-delivered matching entries are explicit; observer delivery can lag.

## Evidence, overhead and checks

- [Native output and compressed logs](../../../../output/s5-input-trace)
- [Raw native result](evidence-trace.json)
- [Derived stage analysis](analysis.json)
- [Historical failed target](../bundled-settling/README.md)

Prelaunch and post-exit hashes cover executed sources, bundles and backend
binaries; each worker's loaded DLL is observed. Traces are bounded, retained in
memory and saved with the native result. Failure handling saves a trace snapshot
when invoked; native failures retain the marked runtime. Normal cleanup checks
the canonical parent, owner marker, allowed inventory, links and file types.
Helper processes/whole-tree cleanup remain outside qualification.

Logs are compressed after measurement, then independently decompressed and
rehash-checked. Native main/renderer receipt agreement remains required.
Original chunk boundaries are not persisted, so the checker does not claim to
recompute chunk-sensitive receipt chains from the log alone.

Timing hooks, a worker IPC notice, ACK scanning, the main timer and long-task
observer add uncalibrated overhead. No null-observer comparison or overhead
subtraction was performed. This run therefore cannot establish that the old
spike is fixed, a backend regression percentage, or production performance.

With the existing S1 dependencies, from the repository root:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-trace/check-evidence.js
rtk proxy node --test feasibility/s5-performance/ui/input-trace/test/*.test.js
```

`check-evidence.js --runtime` also checks recorded local bundles/binaries. The
probe refuses existing output/evidence. Native sources stay frozen after launch;
analysis and tests are separately covered by the review seal.

Next: separate parent control delivery/worker scheduling from worker-local
write-to-ACK time, and isolate scheduling waits caused by awaited feed/search
work, before the hour-long run. The historical latency failure remains open.

## Delegation

Muse, Space Bunny and DeepSeek completed supplied-context work without tools or
independent workspace verification. Muse's probe-join and same-clock advice was
used. Space's physical-paint/observer caveats were retained; its claims that
35 scheduled probes cannot fit this cadence, or that same-main-clock end-to-end
timing is forbidden, do not match the instrument and were not adopted.
DeepSeek's overlap proposal was adapted to preserve boundary/unknown/open states
conservatively. Parent implementation, native execution and checks determine
the result. GPT-6.1 Luna was not retried after its recorded account rejection;
the recorded consumer Agy route remains excluded.

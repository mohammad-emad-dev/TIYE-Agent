# Probe control transport comparison — 16 October 2026

This additive experiment compares stdin-pipe and child-process IPC delivery for
probe commands. The [earlier search-overlap capture](../input-search-overlap/README.md)
records a 102.96 ms parent pipe-write completion interval for a 109.08 ms input
sample. It does not establish the cause. Earlier captures remain unchanged.

## Recorded result

Both runs completed and validate 35/35 probes each: 70 total, with no skips,
correct route echoes, full exposure, matching view labels, contiguous raw ACKs
and complete search-wait containment. Each verifies 50,000 events, 36 page/DOM
checks and five terminal captures. Executed source/build hash maps, deadlines
and per-ordinal view assignments match across runs. Twenty-seven tests pass.

| Observed application proxy | Pipe | IPC |
|---|---:|---:|
| Dispatch → render-notice median | 13.54 ms | 13.45 ms |
| Grid maximum | 16.51 ms | 286.61 ms |
| Focus maximum | 105.71 ms | 386.59 ms |
| Inputs exceeding unchanged 100 ms bound | 2 / 35 | 3 / 35 |
| Maximum API-completion callback interval | 102.08 ms | 377.97 ms |

The API row refers to different APIs and is not worker-receipt timing. Pipe
ordinals 20 and 35 exceed the bound; IPC ordinals 6, 22 and 35 do. The experiment
does not support adopting IPC as a latency fix. It also cannot establish that
IPC caused a general regression from these two fixed-order observations.

For the worst pipe probe (20), the worker-local command-to-ACK interval is
0.46 ms. For pipe probe 35 it is 96.91 ms. IPC probe 6 has a 277.10 ms worker-local
command-to-ACK interval; IPC's worst application probe (35) has 249.47 ms.
Its main-clock stages are 0.43 ms dispatch-to-input notice, 378.35 ms input notice
to ACK ingress and 7.81 ms ACK ingress-to-render notice. These separate-clock
observations show that long intervals also occur inside the worker-observed
ACK path; control transport alone is not an established explanation.

No recorded main timer-lateness span or already-delivered renderer long-task
entry overlaps those over-bound probes. Neither observation rules out blocking
or delayed observer delivery. Due-to-dispatch maxima are 15.89 ms pipe and
13.95 ms IPC. RAF/search proxies pass their existing bounds; short-drain idle
resource coverage remains insufficient. Both input targets/full S5 remain open.

Next: instrument worker scheduling and the producer/PTY ACK path before choosing
a transport change or running the bundled hour-long performance gate.

## Experiment

Two fresh native runs use the same frozen source and built binaries, in fixed
order: **pipe, then IPC**. Each retains the three-minute five-PTY waveform,
incremental 50,000-event feed, ten-second drain, 35 fixed input deadlines, view
coordination and 35 controlled pending-search response waits. Only probe commands
select a transport. Start, pause and resume remain on stdin; output remains on
stdout and timing notices remain worker-to-parent IPC.

The selected transport is explicit in the profile and every parent/worker probe
record. Workers reject probes on the other channel, malformed/extra fields and
noncontiguous/duplicate ordinals. A false write/send return is backpressure and
never triggers a retry or fallback. Channel errors fail the run.

The main records send start and API callback on its own clock. Worker-local
command/write/ACK timestamps remain separate. `stdin.write` and `child.send`
callbacks observe their respective API completion, not worker receipt; their
durations are labeled separately. The unchanged application endpoints—main
dispatch to render-notice arrival, and input-notice to ACK ingress—can be
described for each run. No cross-process timestamp subtraction occurs.

Two channels can reorder probe and flow-control messages. This is part of the
variant's behavior; no global ordering across channels is assumed. View/ACK
integrity and held-search containment must verify independently in both runs.

## Evidence and limits

[Comparison](../../../../output/s5-input-transport/comparison.json),
[pipe result](evidence-pipe.json), [IPC result](evidence-ipc.json),
[pipe captures](../../../../output/s5-input-transport-pipe) and
[IPC captures](../../../../output/s5-input-transport-ipc) retain both observations.
Per-ordinal application latency is retained without averaging away failures.
The comparison requires equal executed-source/build hash maps, waveform settings,
ordinal sets and deadlines, and reports any view mismatch between runs.

This is one observation per profile with fixed order and uncalibrated observer
overhead. Fresh processes do not remove OS/cache/load/warmup/order confounding.
No causal improvement percentage, root cause, equivalence or general reliability
follows. Controlled search waits are intentional async page-response holds,
not synchronous SQLite contention or an ordinary search-latency benchmark.
Renderer/RAF events are application proxies, not physical paint. Memory settling,
hour-long workload behavior, process-tree cleanup and full S5 remain unqualified.

From the repository root, using the existing S1 dependencies:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-transport/check-evidence.js pipe --runtime
rtk proxy node feasibility/s5-performance/ui/input-transport/check-evidence.js ipc --runtime
rtk proxy node --test feasibility/s5-performance/ui/input-transport/test/*.test.js
```

Without `--runtime`, recorded source/artifact/semantic checks still run; local
bundles/backend binaries are additionally checked with that flag. The runner
refuses existing per-profile evidence/output. Prelaunch/post-exit fingerprints,
loaded DLL observations, raw decoded hashes/lengths, main/renderer receipts,
SQLite/FTS/reopen integrity and full probe joins remain required. Raw chunk
boundaries cannot be reconstructed independently from concatenated terminal logs.
Compression happens after measurement. Failed runtimes are retained; normal
cleanup validates owner, canonical parent, links, file types and inventory.

## Delegation

Muse supplied a transport-helper draft, adapted to reject violations explicitly
and require callbacks. Space Bunny and DeepSeek supplied context-only reviews;
no delegate tools or independent workspace verification occurred. The parent
implemented and ran the experiment. Fixed-order, callback-semantics and channel
ordering caveats were retained. Unsupported cross-clock send/receipt arithmetic,
claims that unchanged application endpoints become incomparable, and assertions
about unobserved workload channels were rejected.
The requested Codex model remains unsupported on this account; the recorded Agy
consumer route remains excluded. No service, auth or credential settings changed.

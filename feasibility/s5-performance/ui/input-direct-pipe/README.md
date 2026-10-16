# Producer direct-pipe isolation — 16 October 2026

The preceding [receipt diagnostic](../input-receipt/README.md) retained ordinary
input delays up to 255.20 ms. This additive control replaces member 0's PTY
producer bridge with ordinary child-process stdin/stdout pipes. Members 1–4
retain bundled ConPTY. Five xterms, the three-minute waveform, incremental
50,000-event feed, fixed input slots, view coordination, receipt notices,
producer/worker traces and held searches remain.

## Recorded result

One completed capture took 197.59 seconds. All 35 probes, raw ACK ordinals,
receipt command stamps, controlled search intervals and renderer stage joins
reconcile. All 50,000 events, 36 search/page/DOM checks and five member logs
verify. Member 0's original raw stdout byte count and SHA-256 match its decoded
stored log; its child exits zero with no signal or stderr. The worker module
observations show no ConPTY DLL for member 0 and the bundled DLL for members 1–4.
Thirty-five tests pass.

| Population / control | Recorded result |
|---|---:|
| Ordinary inputs | 34 |
| Ordinary inputs above unchanged 100 ms bound | 0 |
| Ordinary median / maximum | 14.51 ms / **18.40 ms** |
| Ordinal 7 deliberate minimum pre-write delay | 120 ms |
| Control: worker command → write start | 125.33 ms |
| Control: main dispatch → render-notice arrival | 129.79 ms |
| All 35 inputs above 100 ms | ordinal 7 only |

The positive control remains in the all-input report, so its focus-view proxy
still fails the unchanged 100 ms criterion as expected. The 34 ordinary samples
are summarized separately; none is removed. Producer and worker traces retain
two and one late ticks respectively. These observations do not establish the
cause of historical PTY delays. RAF/search proxies pass; short-drain idle
coverage remains insufficient. Full S5 and product performance remain open.

### Interrupted first attempt

The first attempt lost window focus at the 120-second slot. It records 23
completed probes, a skipped slot 24 and the consequent held-search watchdog
failure. Its [archived trace, logs and manifest](../../../../output/s5-input-direct-pipe-failed-focus)
remain explicitly incomplete and nonqualifying. The marked runtime is retained;
no process-tree cleanup qualification is claimed. The second attempt used
identical executed sources and build hashes. A regression verifies the archived
bytes, skipped slot and source equality. These are one completed capture and
one interruption, not two successful repetitions.

## Scope and implementation

This is **four PTYs plus one direct-pipe member**. Machine-readable evidence
sets `combinedPtyWorkload=false`, `ptyMembers=4`, `directPipeMembers=1` and
`backendIsolationControl=true`. Only member 0 receives the measured probes.
The direct wrapper uses incremental UTF-8 decoding, hashes original stdout,
drains/counts stderr and reports child `close` after output and decoder tail.
Pause/resume controls stdout reads; a false stdin write return means queued
delivery and never triggers a retry. Child/stream errors fail the worker.
Worker disconnect and test deadlines kill only the owned child handle.

The real-process tests cover split multibyte output, paused output delivery,
complete close, late-write rejection, truncated UTF-8 raw-hash mismatch and
nonzero exit/stderr visibility. The native checker requires raw stdout equality,
sidecar equality, topology observations, complete ordinal joins and prelaunch/
post-exit source and binary hashes. Concatenated logs cannot reconstruct original
chunk boundaries. Compression occurs after measurement.

Replacing a PTY also removes TTY/raw-mode and terminal-host behavior and changes
chunking, flow control and process scheduling. The raw-output hashing adds
uncalibrated observer overhead. This single member and fixed-order historical
comparison is not randomized or paired and provides no variance estimate.
It cannot quantify ConPTY overhead, prove a causal speedup or justify a product
transport replacement. Main/worker/producer/renderer clock origins stay separate;
no cross-clock timestamps are subtracted. Render notices and RAF events do not
measure physical paint. Held searches are asynchronous response waits, not
synchronous query contention. The historical failures remain preserved.

Next: define a bounded investigation of the PTY bridge using these contrasting
observations. A five-PTY latency decision is still needed before retiring the
historical input gate; this diagnostic cannot qualify it.

## Evidence and checks

[Native result](evidence-pipe.json), [analysis](analysis-pipe.json),
[completed-run logs and sidecars](../../../../output/s5-input-direct-pipe-pipe)
and [review seal](review-seal.json) retain the evidence.
Using the existing S1 dependencies, from the repository root:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-direct-pipe/check-evidence.js pipe --runtime
rtk proxy node --test feasibility/s5-performance/ui/input-direct-pipe/test/*.test.js
```

`--runtime` additionally verifies the recorded local bundles and backend binaries.
The runner refuses existing evidence/output. Successful cleanup validates owner,
paths and inventory; failed runtimes remain marked. Memory settling, hour workload,
whole-process-tree cleanup, the product core and production remain unqualified.

## Delegation

Muse supplied a wrapper draft; the parent added raw stdout witnesses and tests,
implemented the cohort and ran its gates. Space Bunny and DeepSeek reviewed
supplied context. All three calls completed with zero tool events and did not
independently verify the workspace. TTY/chunking/topology and single-run caveats
were retained. Cross-member or cross-run exact output equality and physical-paint
claims were rejected. The requested Codex model remains unsupported on the
account; the recorded consumer Agy route remains excluded. Authorized free
fallbacks were used. No service, authentication or credential settings changed.

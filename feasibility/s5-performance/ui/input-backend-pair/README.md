# Bounded PTY / direct-pipe comparison — 16 October 2026

The [preceding isolation capture](../input-direct-pipe/README.md) did not reproduce
the ordinary PTY spikes with member 0 using direct pipes. That historical
contrast could not attribute the difference to a backend. This cohort runs the
two topologies using one source/build snapshot and then ends this diagnostic series.

## Protocol and result

The [protocol](protocol.json) was saved before launch and hashed into both
captures. The coordinator permits exactly two attempts, in fixed order: `pty`
then `direct`, with zero retries. Each attempt runs the three-minute waveform
and ten-second minimum drain, five xterms, 50,000 incremental events, 35 fixed
input slots and 35 held-search intervals. Control input travels over worker
stdin pipes in both; only member 0's producer backend changes. The unchanged
100 ms application proxy is main dispatch to render-notice IPC arrival.

| Profile | PTYs / direct members | Total capture | Ordinary median / maximum | Ordinary ordinals over 100 ms | Control worker wait / main total |
|---|---:|---:|---:|---|---:|
| pty | 5 / 0 | 201.21 s | 14.62 / 33.33 ms | [] | 125.88 / 141.75 ms |
| direct | 4 / 1 | 198.58 s | 14.78 / 21.29 ms | [] | 123.82 / 135.93 ms |

Both attempts completed. Each retains 34 ordinary inputs and the separate
ordinal-7 minimum 120 ms pre-write control; both controls meet their criteria.
All 70 probes, receipt command stamps, ACK ordinals, renderer stage joins and
controlled-search intervals reconcile. Both feeds contain and reopen all 50,000
events; all 72 search/page/DOM checks and ten captured member logs verify.
Executed source and build hashes are identical across captures and unchanged
after exit. Scheduled input views match for 35 of 35 ordinals; the comparison
retains each actual view instead of assuming schedule timing made them identical.
Thirty-six tests pass, including comparison mutation cases for hashes, topology,
control, schedule, transport and the direct raw-child witness.

Neither run reproduces the historical ordinary input breach. This is not a fix
or a repeatability guarantee. The intentionally delayed control remains in each
all-input report; it is expected to fail the unchanged 100 ms focus-view proxy.
It is not included in the explicitly labelled ordinary-only population.
The full-S5 result remains false, including insufficient short-drain idle coverage.

## Decision and stopping point

Retain bundled ConPTY as the **experimental prototype backend**. Direct pipes
remain diagnostic-only because they do not provide terminal semantics. This
pair does not promote either backend to product eligibility. The historical
latency failures remain open and byte-preserved; no component cause was identified.

This completes the declared two-attempt investigation. Do not start another
latency cohort automatically. Return to the remaining Phase 0 readiness decision
(including S4, S6 and the unresolved S5 limits), then define the core service/event
store construction entry conditions under architecture Section 11.2. Product
construction and release readiness must not be inferred from this comparison.

## What is verified, and what is not

The `pty` profile uses five bundled ConPTY workers. The `direct` profile uses
four bundled ConPTY workers plus member 0's directly spawned producer. Worker
module observations and counts must match that topology. Per-run stored byte
hashes/lengths reconcile with main and renderer receipts. Direct stdout is also
hashed before UTF-8 decoding and must match member 0's stored log, with a zero
exit, no signal and zero stderr. The PTY raw-child witness is explicitly null;
no equivalent observation is invented for the PTY path. Neither check proves
cross-member screen equality or reconstructs original chunk boundaries.

This is one capture per topology, with fixed order and shared host noise, not
randomized or statistically paired observations. Ordinary inputs share a process
lifetime; their count is not an independent-run sample size. TTY/raw-mode, host
processes, chunking, flow control and observer costs differ. No variance estimate,
causal speedup or PTY overhead is inferred. Each duration uses its own process
clock; timestamps from separate processes/runs are never subtracted. Render
notices and RAF are not physical-paint measurements. Search holds are async
waits, not synchronous query contention. Raw hashes cover bytes within a run;
output volume, chunk chains and timing sidecars need not match between runs.

Sources are an additive frozen measurement snapshot, preserving historical
cohorts rather than refactoring measured code. Comparison reuses their schedule,
overlap and receipt validators. Successful cleanup checks canonical paths,
ownership and inventory. Native failures archive known synthetic logs and
trace files with hashes and retain marked runtimes; that failure branch was not
exercised by these two successful captures. Whole-process-tree cleanup, hour
performance, memory settling, product core and production remain unqualified.

## Evidence and commands

- [Attempt ledger and comparison](../../../../output/s5-input-backend-pair)
- [PTY evidence](evidence-pty.json), [analysis](analysis-pty.json), [artifacts](../../../../output/s5-input-backend-pair-pty)
- [Direct evidence](evidence-direct.json), [analysis](analysis-direct.json), [artifacts](../../../../output/s5-input-backend-pair-direct)
- [Review seal](review-seal.json)

From the repository root with the existing S1 dependencies:

```powershell
rtk proxy node feasibility/s5-performance/ui/input-backend-pair/check-pair.js --runtime
rtk proxy node --test feasibility/s5-performance/ui/input-backend-pair/test/*.test.js
```

The first command verifies the attempt ledger, both complete native captures
and the persisted pure comparison. `--runtime` also checks local bundles and
backend binaries. The coordinator refuses an existing ledger or captured output.

## Delegation and review

Muse, Space Bunny and DeepSeek supplied context-only comparison contract reviews;
all completed without tool events or independent workspace verification. The
parent implemented and ran all gates. Their fixed-order, witness-asymmetry and
control-retention caveats were retained. Invented schema fields and inconsistent
ConPTY counts were rejected. Numeric descriptive summaries are valid; they do not
establish a cause. A shared clock is not required to compare independently
measured durations, though cross-clock timestamp subtraction stays prohibited.
Codex's recorded unsupported model and the excluded consumer Agy route were not
retried. No service, route, authentication or credential configuration changed.

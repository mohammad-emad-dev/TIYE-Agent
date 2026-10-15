# Paused-output resize controls — 16 October 2026

**Result: both native controls failed exact content comparison. Resize remains unqualified.**
These additive controls preserve the earlier active-output failures unchanged.

Five isolated ConPTY producers use the original UTF-8 fixture, including Arabic,
Japanese and a combining accent. HOLD stops the producer interval; an in-band
HOLD marker and all renderer write callbacks form the application-output barrier.
Record counts are checked unchanged through the failing resize. This does not
claim the console emits no redraw/control output while producers are held.

| Checkpoint at 100×12 → 60×16 | Paused | Boundary control |
|---|---|---|
| Before resize, exact full record history | Pass, all five | Pass, all five |
| After xterm resize, before native resize | Not sampled | Pass, all five |
| After native resize, SIZE convergence and HOLD barrier | Fail, all five | Fail, all five |
| Missing numbered records in final snapshot | None | None |
| Altered records per terminal | Five | Five |

The unchanged 100×12 phase also passed content, resumed output and public
scroll API checks. Both runs stop at the failing narrow phase; subsequent
geometry and scroll phases were not reached. The two runs contain different
record totals because producer scheduling varies. They are separate controls.

## Interpretation

The failure does not require concurrent new application records. In the boundary
run, the first sampled mismatch appears after native PTY resizing and subsequent
console output, while the immediately preceding xterm-only resize snapshot is
exact. This localizes the observed transition; it does not establish a defect
in ConPTY, xterm, extraction, or one particular resize-order algorithm.

The next step is replaying the preserved chunk journal around that transition
to isolate redraw/reflow ordering, then checking a proposed coordination fix
against the original active-output case. A passing held control alone cannot
close that case. No dependency upgrade or unsupported xterm option was applied.

## Evidence and verification

- [First native capture](../../../../output/s5-interaction-paused)
- [Boundary capture](../../../../output/s5-interaction-paused-boundary)
- [Boundary source](../interaction-paused-boundary)
- `evidence.json`: native exit, prelaunch hashes, artifact hashes and explicit false qualification flags
- `checkpoints.jsonl`: full extracted record histories, dimensions, counters and rolling receipt hashes
- `journal.json`: original decoded PTY chunk boundaries, byte-for-byte equal to each captured log
- `expected-*.jsonl`: canonical intended producer records before stdout writes
- `control-*.jsonl`: HOLD counts and SIZE reports, including stale cached reports
- `failure.json`: native assertion and last checkpoint

The runner persists prelaunch source/build hashes before launching and compares
them again after exit. Failure copies retain exact UTF-8 bytes. Each checkpoint's
renderer receipt hash is independently recomputed from its prefix of the chunk
journal. No record spaces are trimmed, no Unicode is normalized and no records
are deduplicated. JSONL framing removal in the checker does not alter JSON string
values. Comparison reuses the unchanged strict comparator from the earlier cohort.

From the repository root, with the existing S1 dependencies installed:

```powershell
rtk proxy node feasibility/s5-performance/ui/interaction-paused/check-evidence.js
rtk proxy node --test feasibility/s5-performance/ui/interaction-paused/test/evidence.test.js
```

Both checks verify **preserved failure evidence**, not successful qualification.
Three tests cover both captures and rejection of missing, reordered and
space-altered records. After building both directories, `check-evidence.js
--runtime` also checks local bundle hashes. Each runner refuses existing evidence
or output; rerunning `probe` here is intentionally blocked. Dist bundles are ignored.

Both failed runtime directories remain retained. Failed-host teardown was not
qualified; `ownedCleanup=false`. No provider requests were made by the native
controls. Full S5, physical wheel/paint, production eligibility and the product
core remain unqualified.

## Delegated review

Muse Spark and Space Bunny completed supplied-context reviews without tool use.
DeepSeek timed out without a final response; none of its code was adopted.
GPT-6.1 Luna was not retried after the recorded unsupported-model rejection.
The recorded consumer Agy route remains excluded.

Muse's separation of held and active verdicts and persistence advice was used.
Space Bunny's assertion that a held control cannot exhibit this failure was
contradicted by both native captures. Its claims about missing per-member ground
truth also did not match this harness. Neither review establishes root cause.
Parent review and executed checks determine this report.

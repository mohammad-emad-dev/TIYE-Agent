# Resize redraw replay — 16 October 2026

**Finding: the first preserved redraw chunk reproduces the native mismatch.**
The five baseline replay results exactly match the five record arrays in the
[paused native failure](../interaction-paused/README.md). This replay launches
Electron/xterm only; it makes no provider requests and launches no PTY or producer.

## What ran

Fifteen fresh xterm 5.5 instances replay the same decoded PTY chunks, with the
recorded ConPTY metadata (Windows build 26300). Each starts at 100×12 and receives
the entire original prefix through the held checkpoint. All fifteen prefixes
match their native snapshots and exact canonical record history.

| Replay order, five members each | First mismatch | Final altered records per member |
|---|---|---|
| Resize to 60×16, then replay suffix | First redraw chunk | Five |
| Replay first suffix chunk at 100×12, resize, replay remainder | First redraw chunk | Four, each with four extra spaces |
| Replay entire suffix at 100×12, then resize | First redraw chunk | Four, each with four extra spaces |

No bytes are removed or changed in any variant. The original resize-before
sequence remains exact immediately after local resize. Its next chunk starts
with cursor-hide and cursor-home commands, rewrites existing screen content,
and restores the cursor. That chunk is sufficient to reproduce all five native
record-array failures; subsequent SIZE/HOLD chunks do not repair them.

The two alternate orders preserve the formerly damaged partial record, but
four other records retain four literal trailing spaces. Consequently neither
ordering fixes strict content preservation. No record IDs are missing in these
replay cases. This establishes a repeatable input-level trigger; it does not
establish which component is defective or qualify active native resizing.

## Captures and checks

- [Native input journal and checkpoints](../../../../output/s5-interaction-paused-boundary)
- [Replay snapshots and prelaunch manifest](../../../../output/s5-interaction-replay)
- [Derived comparisons and redraw byte summaries](analysis.json)

Each suffix chunk is parsed through xterm's public write callback, followed by
a snapshot of all physical buffer rows, wrap flags, cursor and exact extracted
records. The analysis reports the first mismatching chunk ordinal per member.
Its CSI summary uses a bounded pattern for ESC-prefixed CSI sequences and UTF-8
byte offsets; it is a description of these captured chunks, not a general
terminal parser or a replacement for xterm. Printed record-run space counts
are diagnostic only. Original strings remain intact.

The prelaunch manifest fingerprints source, browser bundles and both native
input files. The runner checks they stayed unchanged after execution. The
verifier checks recorded hashes, full prefix/final equality, exact suffix
ordinal coverage, resize ordering, dimensions and preserved four-space changes.

From the repository root with the existing S1 dependencies:

```powershell
rtk proxy node feasibility/s5-performance/ui/interaction-replay/analyze.js
rtk proxy node --test feasibility/s5-performance/ui/interaction-replay/test/replay.test.js
```

Three tests cover native reproduction plus rejection of missing checkpoint and
space-normalized evidence. `analyze.js --runtime` additionally checks existing
local bundle hashes. `build.js` rebuilds ignored bundles; `run.js` refuses to
overwrite this evidence/output. A clean build uses the same installed S1
toolchain; these scripts do not install packages.

The one replay host execution completed successfully, with unchanged sources,
builds and inputs. Its profile directory remains retained and cleanup is not
qualified. These are buffer/parser observations, with no physical paint, wheel,
input-latency, native resize success, product-core or full-S5 qualification.

## Next investigation

Use the reproducible redraw to compare console output semantics and terminal
width/space handling before changing coordination. A native comparison with
node-pty's existing experimental bundled-ConPTY option is a possible bounded
next test; it has not run or been selected as a product default. Any proposed
fix must preserve all bytes and pass the original active-output case.

## Delegates

Muse completed a supplied-context review; its chunk-by-chunk replay advice was
used. DeepSeek completed a supplied-context byte-summary proposal; its advice
to retain offsets, exact CSI spelling and explicit space counts was used, while
its general parser code was not adopted. Space Bunny timed out without a final
response. No delegate used tools or independently verified the workspace.
The requested GPT-6.1 Luna remains unavailable under the recorded account
rejection, and the recorded consumer Agy route remains excluded. Neither was
retried. The parent implemented and executed this replay and its checks.

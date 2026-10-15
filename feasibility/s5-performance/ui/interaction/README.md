# S5 resize and scrollback observation — failed qualification

The active-output **100→60-column resize failed exact buffer-content checks**.
Resize/scroll qualification remains false. This directory preserves the
experiment, two failed attempts and a read-only verifier of the failure.
It does not contain a successful native interaction cohort.

## Recorded finding — 16 October 2026, Asia/Amman

In the second attempt, all five xterms and child TTY reports reached 60
columns × 16 rows, but the reconstructed buffers lacked two expected record
IDs each and contained exact-text differences:

| Member | Expected records | Observed logical records | Missing IDs | Altered records |
|---|---:|---:|---|---:|
| 0 | 104 | 102 | 88, 89 | 12 |
| 1 | 105 | 103 | 88, 89 | 13 |
| 2 | 104 | 102 | 88, 89 | 12 |
| 3 | 103 | 101 | 86, 87 | 12 |
| 4 | 104 | 102 | 87, 88 | 12 |

The missing IDs' prefixes are present in the decoded PTY capture files.
Renderer receipt-byte counts equal the respective stored-file lengths at
the failing snapshot: 16,477, 16,621, 16,477, 16,339 and 16,479 bytes.
This is evidence of a buffer/reflow integration mismatch rather than proof
that those record prefixes never reached main. It does not establish which
part of resize coordination, ConPTY redraw, xterm parsing or snapshot
reconstruction caused the mismatch. Some differences are added trailing
spaces; others include additional text. None is trimmed, normalized,
deduplicated or removed to make the comparison pass.

The original native assertion and all five snapshots are in
[`output/s5-interaction/failure.json`](../../../../output/s5-interaction/failure.json).
Producer-authoritative JSONL, child size/HOLD telemetry and decoded capture
logs are beside it. [failure-evidence.json](failure-evidence.json) explicitly
records exit 1, zero completed cohorts, no cleanup and false qualification
flags. The original per-chunk journal stayed in main memory and was not
written before the failure; no receipt-chain verification is claimed for
this failed run. Copied files have independently checked SHA-256 hashes.

## Fixed experiment and intended coverage

Five isolated Electron-as-Node node-pty workers run real host-Node TTY
producers. Each producer writes an authoritative record to JSONL before
emitting its text through the PTY. Records have short member/sequence prefixes
and long ASCII, Arabic, CJK and combining-mark payloads. Comparisons use exact
code points and logical order, with no visual Arabic shaping claim.

The [plan](fixture.js) requests 100×12, 60×16, 132×10, 80×20 and 100×12
terminal geometries and corresponding real Electron window sizes. The run
reached phase 1 (60×16) and stopped at its first content comparison. Later
geometries and that phase's subsequent scroll checks were not completed.
Earlier phase-0 execution cannot qualify the complete five-phase plan.

The harness starts output before each resize. Main pauses delivery while
draining pending xterm writes, resizes xterm, requests native PTY resize and
then delivers the buffered chunks in ordinal order. Producers remain active
through this coordination window. An investigation must evaluate whether
buffered old-geometry output and asynchronous backend redraw interact with
this ordering; that is a hypothesis, not an established root cause.

Each phase then HOLDs producers at record boundaries. Main requires matching
HOLD markers in captured output and all renderer write ACKs before reading
buffers. At a complete phase, intended API checks are:

- `scrollToTop()` gives viewport zero with retained history.
- At least ten additional records arrive while scrolled up; viewport and top
  row stay stable while the buffer base grows, without a resize between reads.
- `scrollLines(7)` gives viewport seven and the previously captured seventh
  physical row.
- `scrollToBottom()` restores viewport to the buffer base.

These are xterm buffer/API observations. Physical mouse-wheel input, paint,
frame latency and end-to-end input behavior are not qualified. No feed/search
mixed-load result is inferred from this terminal-component experiment.

Snapshots use public xterm buffer APIs. Empty terminal padding cells are
removed while real space cells and width-two continuations are preserved;
wrapped rows are joined with their exact supplied strings. The parent adapted
the caller from the supplied trimmed-row design to avoid losing a real space
at a wrap boundary. The helper does no trimming or Unicode normalization.
Scrollback is 10,000 rows per terminal and the decoded journal cap is 8 MiB;
overflow fails rather than evicting history. Raw ConPTY redraw tokens are
not used to establish record cardinality. Their presence in captures is a
separate diagnostic observation only.

## First attempt: stale TTY metadata

The [first preserved attempt](failed-attempt/manifest.json) required the
first child size report to match immediately. At 60×16, members 0–2 reported
cached 100×12 values while members 3–4 already reported 60×16. Local Node
26.7.0 source shows `WriteStream.getWindowSize()` returns cached columns/rows.
No private TTY refresh API was added to the program.

The second attempt introduced a separately recorded 2-second convergence
bound with 50 ms re-query spacing. It does not repeatedly resize or change
the requested geometry. Every reported child value remains in its control
JSONL, including stale values. The matching value is a converged child TTY
report, not an independent kernel-size measurement for every query. The
original immediate-report failure and its sources/builds remain preserved.
No buffer-content or scroll expectation changed. The second attempt then
failed on actual exact-content checks, as reported above.

## Verification and preservation

From this directory:

```powershell
rtk proxy npm run test
rtk proxy npm run check
rtk proxy npm run check:runtime
```

These commands verify the **preserved failed observation**, not a successful
interaction qualification. Five tests cover the joining contract, invalid
rows, missing-prefix rejection, the native missing-ID regression and refusal
to accept changed padding, duplicates, reordering or missing records.
The checker regenerates canonical producer records, verifies the reported
failure, child TTY convergence, decoded-prefix presence, receipt byte counts,
artifact hashes and both sets of measured source/build snapshots.

`build` produces ignored bundles. `probe` still performs the native experiment
and fails if content differs; it refuses an existing success evidence file or
`output/s5-interaction` directory. It cannot overwrite this failure bundle.
Any further observation needs a separate source/artifact mapping.

Both failed runtimes remain local. On failure, only captured worker children
are stopped and file handles close; no normal runtime cleanup is claimed.
Producers have a bounded lifetime. No stale-runtime cleanup, name-based kill,
provider call, dependency installation, credentials or configuration change
is performed. The unused success path requires graceful END/exit, complete
buffer/receipt checks and owned canonical no-link cleanup.

Source/build snapshots were taken after each attempt. The runner calculated
prelaunch hashes in memory but did not persist or compare them on the failure
path, so this bundle makes no independently verifiable pre/post-run source-
freeze claim. The snapshots themselves and current measured bytes are checked;
all earlier cohorts remain byte-identical. Native toolchain remains existing
Electron 38.8.6, node-pty 1.1.0, xterm 5.5.0 and host Node 26.7.0 on Windows.

## Delegation and next step

DeepSeek V4.1 Flash Free max supplied the joining helper and three tests.
Muse Spark 1.3 Free xhigh and Space Bunny Free xhigh supplied design reviews.
Parent review adapted padding handling, implemented the native harness and
verified the artifacts. The delegates inspected only their supplied context;
native streams contain zero tool calls. Artifact/deliverable hashes are in
`review-seal.json`.

The previously rejected Codex `gpt-6.1-luna` account route was not retried;
Space Bunny supplied the authorized fallback review. Agy was not dispatched
under the recorded
[consumer-route restriction](../../../s4-provider-access/antigravity-consumer/README.md).

**Next:** isolate resize coordination using a separately recorded paused-output
control and replay investigation, then fix the demonstrated mismatch before
qualifying active-output resize. Product core, full S5 and production
eligibility remain unqualified.

The separate [Windows PTY compatibility comparison](../interaction-windows/README.md)
also failed with the identical UTF-8 fixture. Setting supported xterm Windows
backend/build metadata alone did not resolve the blocker. Its one invalid
locale-decoded copy attempt is preserved and excluded; no result from it is
treated as a same-fixture comparison.

# S5: five-terminal flood observations

Reviewed 15 October 2026. This additive harness exercises five isolated native
PTY workers in an Electron/xterm shell for 60 seconds per view. It is a
feasibility prototype, not the product application. Full S5 and production
eligibility remain false.

## Recorded results

The corrected cohort is in [evidence.json](evidence.json). Each of its ten
producer sessions ran for at least 60,000 ms and exited with worker/terminal
code zero. Persisted raw PTY bytes match incremental capture and renderer
receipt hashes for every member. Normal owned-runtime cleanup completed.

| Observation | Grid: five terminals | Focus: one shown, four retained |
|---|---:|---:|
| Captured raw PTY bytes, all members | 11,714,399 | 10,029,633 |
| Synthetic input probes completed/planned | 28/28 | 28/28 |
| Host dispatch-to-render ACK p95 | 25.35 ms | 24.91 ms |
| Host dispatch-to-render ACK maximum | 28.86 ms | 25.24 ms |
| RAF scheduling gap maximum | 83.3 ms | 15.8 ms |
| RAF gaps above 500 ms | 0 | 0 |
| Native window visible at start/end | yes | yes |

Native visibility was also sampled at input dispatch intervals; no sampled
loss was reported. The renderer reported no document visibility loss. This
does not establish uninterrupted native exposure between samples or physical
display scanout. No focus probes were skipped. Both corrected views satisfy
the initial synthetic maximum latency <100 ms and RAF gap <500 ms targets.
No host pause was triggered at this load, so this cohort does not demonstrate
the backpressure path under saturation.

## Measurement boundaries

- A fixed producer emits eight colored Unicode records per batch, with a
  10 ms wait and stdout drain handling, for 60 seconds. Actual record rates
  depend on scheduling. Producer record counts and raw PTY output are different
  domains: ConPTY can transform/coalesce screen output.
- Electron sends synthetic key events to terminal zero every two seconds.
  xterm `onData` forwards a fixed probe to its PTY worker. The producer writes
  a unique ACK into a reserved top row. Completion requires that ACK in the
  visible viewport row during xterm `onRender`.
- Renderer latency uses one renderer clock. Host latency uses one host clock
  from synthetic event dispatch through the returned render ACK, including
  IPC return scheduling. Neither measures physical keyboard-to-photon latency.
- RAF intervals describe browser callback scheduling, not GPU FPS or proof
  that the operating system never froze. Hardware acceleration is disabled;
  background throttling is disabled. Default xterm renderer selection is used.
- Only member zero receives input probes; all five members stream output.
  Grid layout quality, resizing and real CLI behavior are not qualified.
- The renderer retains the bounded run's chunks for receipt hashing; memory
  settling and long-lived buffering behavior remain unmeasured.

The [initial observation](evidence-initial.json) is retained with its exact
[source snapshots](snapshots/). It reported hidden native windows despite a
visible document, and its grid frame series starts with a negative interval:
the first RAF timestamp preceded the separately sampled start time. Its
visible performance targets are unqualified. The corrected source explicitly
shows the window, launches the intentionally visible benchmark without
`windowsHide`, tracks host visibility, and starts frame intervals between RAF
callbacks. Thresholds, producer rate and duration were not relaxed.

## Checks and reproduction

Native Windows prerequisites: the existing S1 dependency installation, resolved
by the parent [toolchain](../toolchain.js). Recorded versions are Electron
38.8.6, node-pty 1.1.0, xterm 5.5.0 and esbuild 0.21.5. No dependency install
or provider/model request is performed by this harness.

From this directory:

```powershell
rtk proxy npm run check
rtk proxy npm run build
rtk proxy npm run check:runtime
```

`check` verifies evidence structure, metric recomputation and measured source
hashes, then runs six regression/negative tests. `check:runtime` additionally
compares the locally built bundle hashes against the corrected observation.
Ignored `dist/` output is rebuilt locally; historical bundle hashes remain in
the initial evidence, with no historical compiled payload checked in.

`rtk proxy npm run probe` refuses to overwrite existing `evidence.json` with
`Existing evidence preserved; no new launch`. For a further cohort, create a
separate additive harness/evidence location and preserve source mappings.
Keep the benchmark foreground during native input probes. Electron requires
focus for [synthetic input delivery](https://www.electronjs.org/docs/latest/api/web-contents#contentssendinputeventinputevent).

On a failed native run, its marked temporary root is preserved and the path
is printed. Success cleanup checks canonical ownership and inventory before
exact file/directory removals. Abnormal process-tree recovery is unqualified;
do not use broad process kills or delete a failed root without checking it.

## Review and remaining work

Muse Spark 1.3 Free at xhigh returned a supplied-design review. MiMo Atria
timed out with no final response. Claude Atria at xhigh failed with connection
refusal and an unrecognized-model diagnostic. Native artifact tool-event
audits and deliverable hashes are recorded in [review-seal.json](review-seal.json).
The Claude read-only tripwire coincided with parent-created flood files;
structured review events contain no tool calls. Parent implemented and
verified the harness. The review predates the visibility/frame corrections
and host dispatch timing addition; those changes were reviewed locally.
Agy fallback was not dispatched because the existing
[consumer route decision](../../../s4-provider-access/antigravity-consumer/README.md)
blocks this third-party wrapper route.

Next: a separate long-run cohort with process CPU/memory and settling
measurements, followed by feed/search load, resize and abnormal recovery checks.
S4 still needs an eligible provider route; S6 remains open. No core engine,
durable event store or full product UI is implemented by this task.

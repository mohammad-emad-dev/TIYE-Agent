# S5 first cohort: five-producer ingress baseline

**S5 remains partial.** This executable workload/capture harness verifies public
synthetic Node stdout bytes and persisted files. PTYs, xterm and the Electron UI
are not measured. No provider CLI, credential/configuration access or model
requests occur in the harness; delegate reviews are separate authorized calls.

## Measured scope

Five fixed producers are launched concurrently, with unique member IDs and
sequence records. Each emits 1,000 UTF-8 records in normal mode, then five new
producers emit 1,000 records each with ANSI color. Every captured byte is hashed
and compared with independently regenerated expected records and file readback.
All members exited zero with no stderr. Writable backpressure pauses/resumes
each member's stdout separately; it was observed for every member.

Current host elapsed times were 186.04 ms normal and 112.58 ms rich, including
process launch and file capture. These one-run short measurements are not UI
latency or sustained-throughput benchmarks and are not compared with S5 UI
thresholds. Different modes must not be ranked by these startup-dominated samples.

Files are confined to an owned temporary root. Cleanup verifies canonical root,
marker bytes, permitted filenames, regular files and single links, then unlinks
exact files and removes the empty directory. No recursive deletion or global
process termination is used. Timeouts/file errors stop only directly captured
producer handles. This is not a sandbox against hostile same-user filesystem
replacement, and it does not supervise descendants or durable restart recovery.

`evidence-initial.json` preserves the first observation with its original
capture source at `snapshots/capture-initial.js`. A code review then tightened
error/timeout teardown to avoid waiting on paused pipes, and `evidence.json`
records a fresh normal/rich run of the revised source. Error/timeout fault
qualification remains open; normal-flow success does not establish it.

## Run

From this directory, `npm run check` verifies current/historical source bindings
and runs five tests: normal/rich five-process capture, corruption/member/exit
refusal, workload bounds and sibling preservation. `npm run probe` creates an observation once and
refuses to overwrite existing evidence. Raw public workload logs are removed
after hash verification; only summaries are tracked. No dependencies are added.

## Next S5 cohorts

| Test-plan scenario | Needed work |
|---|---|
| A: Normal | Attach these workloads to five actual node-pty/xterm terminals in Electron |
| B: Flood | Run five sustained producers for 60 seconds; measure input-to-display and freezes |
| C: Rich output | Add cursor movement/spinners and validate actual terminal display |
| D: Long run | Approximately one hour of mixed traffic, feed events and memory settling |
| E: Views | Compare five visible terminals with one visible/four hidden |
| F: Search | Measure search and feed scrolling on the large D log |

The next implementation step is a separate five-terminal Electron shell with
per-member IPC and output accounting. Preserve S1's prototype/evidence while
reusing its installed toolchain. UI, main/core and PTY CPU/memory observation,
input timing, lossless storage and renderer acknowledgment remain required.
See [the S5 test plan](../../architecture/TIYE-Agent-Feasibility-Test-Plan.md#s5-performance-with-five-active-members).

Muse completed a supplied-design review; remaining delegate outcomes are in
`review-seal.json`. The parent implements, verifies and pushes. Antigravity
consumer CLI fallback remains blocked by the independently recorded S4 decision.
MiMo timed out and Claude hit quota 429. Structured review streams contained no
tool events; Claude's read-only tripwire corresponds to concurrent parent edits.

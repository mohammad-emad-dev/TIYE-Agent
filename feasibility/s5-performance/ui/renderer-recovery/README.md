# S5 renderer crash and reconstruction

This additive native Windows experiment crashes the Electron renderer while
the main process, five isolated PTY workers/producers and separate SQLite
worker continue. A replacement renderer reconstructs terminal buffers from a
bounded main-owned decoded-output journal and queries the surviving feed.
Earlier feasibility sources and evidence remain unchanged.

## Recorded result — 16 October 2026, Asia/Amman

The [native observation](evidence-renderer.json) passed on its first attempt.
Electron reported one expected renderer exit with `reason: crashed` and exit
code 2. The replacement renderer had a different process identity; the old
renderer was confirmed gone. All **12 persistent roles** (main, feed, five
PTY workers and five producers) retained their PID/start-time identities.
The renderer is an additional role, outside those 12.

| Observation | Result |
|---|---|
| Terminal progress after confirmed renderer death | Seven new records from each of five PTYs before reload |
| Main-only outage work | Feed advanced from 10,000 to 20,000 events while the renderer was absent |
| Replay/feed milestone | 391.70 ms from crash request through outage-cut ACKs and the 20,000-event DOM page |
| Final reconstructed terminal buffers | All 600 numbered records and end marker in each of five fresh xterms |
| Decoded capture and replay integrity | 104,960 bytes; all per-member file SHA-256 and receipt chains matched |
| Persistent feed | 50,000 events; exact queried pages, full digest, SQLite/FTS integrity and clean reopen |
| Stale-epoch control | One injected stale ACK rejected without advancing the new ledger |
| Owned child exit and cleanup | All 11 explicitly sampled feed/worker/producer roles exited; normal runtime cleanup completed |

Five regression tests passed. The approximately 392 ms milestone is an
observation of buffer/DOM/ACK completion, not physical paint, input latency,
frame responsiveness or a performance qualification. This cohort does not
replace the earlier foreground or hour-long evidence.

## Ownership and crash boundary

The main process owns all PTYs, log file handles, the feed client and replay
journals. Producers emit 600 numbered fixture records at a nominal 20 ms
interval, then exit. One isolated Electron-as-Node worker owns each node-pty;
the SQLite feed uses host Node in its own process. No product core is present.

Before the fault, the initial renderer has parsed at least 20 records per
terminal, and an exact 10,000-event feed page is checked. The existing exact-
PID Windows sampler captures identities for the 12 persistent roles and the
initial renderer. The main process stops renderer delivery and invokes only
its own `webContents.forcefullyCrashRenderer()`. The scoped exit handler
requires `reason === 'crashed'`; a different reason or second renderer exit
fails the run. No process-name kill or external service action is used.

After the confirmed exit, fresh per-member record counts establish the
outage baseline. Every PTY must produce at least five more records before
reload. SQLite ingestion reaches 20,000 during this window. The replacement
is loaded into the same WebContents with epoch 1, five new Terminal objects,
100-column/12-row geometry and 1,000 lines of scrollback each. A second native
snapshot requires all persistent PID/start identities to match, a distinct
renderer identity and absence/reuse of the old renderer PID. Public evidence
contains role/boolean/status observations, without raw PIDs or start times.

## Replay and ACK contract

The [epoch ledger](epoch-ledger.js), proposed by DeepSeek and independently
tested by the parent, starts at epoch 0 and advances exactly to epoch 1.
Every dispatch and ACK contains epoch, member and ordinal. Current-epoch
dispatch/ACK counters must be contiguous, and an ACK cannot precede its
dispatch. Duplicate, gap, malformed or future-epoch packets fail. Older-epoch
ACKs return false without changing the new counters. Snapshot arrays are
copies. Main IPC handlers also require the owned WebContents and main frame;
these checks are not a claim of security against a compromised renderer.

The replacement sends one deliberate epoch-zero ACK before its epoch-one
ready message. This exercises the real IPC ACK handler and verifies unchanged
counters. The one recorded stale ACK is this test injection, not evidence of
an actual delayed packet from the dead renderer.

Ready is sent only after terminal creation and main-issued epoch bootstrap.
Main's ready callback sends the existing per-member journals synchronously,
without an await. Live-output callbacks therefore cannot interleave with
that replay loop; later chunks follow with their next ordinals. There is no
duplicate suppression or retry that could hide a replay gap. The milestone
requires ACKs through every journal cut captured immediately before reload,
including output generated during the outage, followed by the rebuilt feed
page. Final checks wait for all workers to close and every remaining ACK.

All decoded output is retained from ordinal zero. The journal has a fixed
2 MiB decoded-byte cap and fails on overflow; it never evicts a prefix. This
is bounded synthetic history, not a general history-retention solution.

## Integrity and reconstruction checks

The authoritative byte unit is each node-pty decoded string re-encoded as
UTF-8, not raw ConPTY transport bytes. Main persists those bytes and hashes
them. Main and renderer also compute the same chunk-sensitive receipt chain:

`chain[n] = SHA256(chain[n-1] (32 bytes) || UTF8(chunk[n]))`, starting at 32 zero bytes.

Each xterm write callback precedes its ACK. The checker then verifies actual
terminal buffer content independently of receipts: exactly records 0–599 in
order plus the end marker for that member. The short ASCII fixture does not
wrap at 100 columns; no broader CJK, ANSI cursor-editing or resize/scroll
equivalence is inferred. The new xterms parse the entire retained stream;
they are not screenshots or serialized old Terminal objects.

The renderer's feed DOM is checked against exact SQLite rows before the
crash, after outage ingestion, and after reaching 50,000 events. Each page
contains at most 20 rows. Full feed digest, FTS integrity and close/reopen
checks use the unchanged shared fixture/store. The feed work remains in its
separate process and does not depend on renderer lifetime.

Decoded logs and original chunk boundaries are preserved in
[`output/s5-renderer-recovery`](../../../../output/s5-renderer-recovery).
The checker recomputes file hashes, receipt chains, counts, ordering and
ledger totals from the journal and compares its bytes with those logs.
Native assertions additionally check DOM text against fixture text. Source
and build hashes are captured before launch and compared after exit.

## Commands and artifact preservation

Tested with the existing S1 Electron 38.8.6, node-pty 1.1.0, xterm 5.5.0 and
esbuild toolchain, host Node with SQLite/FTS5, native Windows and PowerShell.
No dependencies are installed. Hardware acceleration is disabled, matching
the earlier cohorts. From this directory:

```powershell
rtk proxy npm run test
rtk proxy npm run build
rtk proxy npm run check
rtk proxy npm run check:runtime
```

`rtk proxy npm run probe` performs the native fault but refuses an existing
`evidence-renderer.json` or output directory with `Existing evidence/output
preserved; no new launch`. Further native runs require separately preserved
source/artifact mappings. Per-phase polling deadlines are 20 seconds and the
host runner has a 60-second watchdog; those are failure bounds, not latency
targets. Failures retain their owned runtime and print its local path.

PTY workers use the earlier bounded 100 ms exit-drain interval and explicit
exit after IPC completion. Complete output/end/exit checks remain required;
the interval is not a universal ConPTY drain guarantee. Before cleanup, all
11 explicitly sampled child roles must be exited or have a different start
identity. Main and replacement renderer then close with the owned Electron
app; the runner waits for host exit. Cleanup verifies the canonical temporary
parent, exclusive owner marker, allowed inventory, no links and single-link
files before individual removal. It never cleans earlier failed runtimes.

## Delegation and remaining scope

OpenCode DeepSeek V4.1 Flash Free at max effort supplied the epoch-ledger
implementation and three tests. Muse Spark 1.3 Free xhigh and the Space Bunny
Free xhigh fallback supplied design reviews. All were supplied-context runs
with no workspace inspection or tool execution. Parent review selected
applicable recommendations, implemented the native harness and independently
ran the gates. Reviewer suggestions that assumed journal eviction, an extra
persistent renderer, or same-epoch retries do not describe this experiment.
Delegate artifact and deliverable hashes are recorded in `review-seal.json`.

The previously rejected Codex `gpt-6.1-luna` account route was not retried;
Space Bunny supplied the authorized fallback review. Agy Gemini 3.8 Flash
High was not dispatched under the recorded
[consumer-route restriction](../../../s4-provider-access/antigravity-consumer/README.md).
No credentials, model configuration or protected service was changed.

This qualifies reconstruction after one renderer failure while main and its
bounded in-memory journals remain alive. It does not qualify main-process or
machine death, reboot, journal corruption, arbitrary histories, task/input
resumption, repeated crashes, physical paint or production recovery. Product
core and full-S5/production flags remain false. Next: resize/scroll interaction
qualification and consolidation of the remaining S5 gaps.

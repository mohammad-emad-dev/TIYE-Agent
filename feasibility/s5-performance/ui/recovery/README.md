# S5 isolated process-fault recovery

This additive native Windows cohort tests SQLite writer crash recovery and
isolation of one terminated PTY worker. It uses the existing S1/S5 toolchain
and synthetic fixtures. Earlier source/evidence remains byte-identical.

## Recorded result — 15 October 2026

The corrected [native observation](evidence-recovery.json) completed in
**13.48 seconds**. Both injected faults passed their bounded contracts:

| Scenario | Observation |
|---|---|
| SQLite writer killed with an open transaction | 10,000 committed events recovered exactly; 1,000 uncommitted events absent |
| Continued ingestion after reopen | 50,000 total events, exact full digest, SQLite/FTS integrity and another clean reopen |
| One original PTY worker killed | Its captured prefix contained 21 ordered records and no end marker |
| Four unaffected PTYs | Each delivered all 300 ordered records, end marker and clean exit |
| Replacement PTY, member 0 generation 1 | All 300 ordered records, end marker and clean exit |
| Owned-process exit/cleanup | All 14 recorded roles were exited; marked-runtime cleanup completed |

All six captured/stored log hashes match. Public decoded logs live in
[`output/s5-recovery`](../../../../output/s5-recovery). The checker rereads
those bytes and independently recomputes counts, ordering, end markers and
hashes. The killed worker's lost tail is not reconstructed or claimed as
recovered. Five regression tests passed, including missing termination data,
false recovery counts, mismatched hashes, FTS damage, truncated survivors,
duplicate/missing process observations and altered native sequence claims.

## Database fault contract

The writer uses the unchanged [SqliteFeed](../mixed/sqlite-feed.js). It commits
10,000 ordered synthetic events through normal append transactions. Test-only
injection then starts `BEGIN IMMEDIATE` and directly inserts and indexes the
next 1,000 events without committing. Before the kill, IPC reports 11,000
writer-visible events, WAL mode, `synchronous=2` (FULL), `cache_size=10`, and
WAL growth from **1,417,312 to 1,491,472 bytes**. The small cache forces this
experiment to exercise WAL writes before the open transaction is killed.

The parent captures the owned writer's process-start identity, checks it
again after the armed signal and terminates that exact child. Its observed
termination was `SIGKILL` with no numeric exit code. A separate new Node
process opens the database, verifies the exact ordered 10,000-event prefix
digest, SQLite integrity, FTS integrity and ten expected `needle` matches.
It appends through 50,000 total events, checks all 50 expected FTS matches,
the full digest and integrity, then closes/reopens and checks again.

Digests cover `JSON.stringify(event) + '\n'` in ascending event-ID order.
The expected prefix and full digests are computed from the unchanged fixture;
the checker independently recomputes them. This demonstrates process-crash
rollback and preservation of earlier commits under this local run. It does
not demonstrate power-loss, filesystem corruption or machine-reboot recovery.

## PTY fault contract

Five independent Electron-as-Node workers each spawn one node-pty producer.
Every producer emits 300 numbered records at a nominal 20 ms interval and
then an end marker. The parent waits until each has at least ten records,
captures exact worker/producer identities and checks the victim worker again
immediately before killing it. Before-fault counts were 12, 11, 12, 10 and 11.
Only the original member-zero worker is targeted; its observed termination
was `SIGKILL`. Its original producer is separately checked for exit.

The other four workers continue while a fresh member-zero generation is
launched. Every unaffected/replacement stream must contain exactly sequences
0–299, in order without duplicates, its end marker, a terminal exit of zero
and worker exit of zero. The victim must have a truncated contiguous prefix
of at least ten but fewer than 300 records, no end marker and a confirmed
abnormal worker exit. Unknown termination never qualifies. This stronger
victim requirement was fixed before the successful native attempt.

Workers allow 100 ms after terminal exit for remaining output, send the exit
message, then explicitly exit after its IPC callback. Complete stream checks
remain mandatory; the delay does not prove a general ConPTY drain guarantee.
This is isolation plus a fresh replacement process. It is not transcript
replay, resumption of the killed task or product-level member recovery.

## Process ownership and artifacts

Only captured child objects are terminated. Windows process sampling queries
exact owned PIDs and start identities; no process-name termination, process
discovery scan or service action is used. All 14 worker/producer/database
identities must be absent or have a different start identity before cleanup.
A reused PID is not terminated. Public observations contain roles/statuses,
without raw PIDs or process-start identifiers.

The runner fingerprints all measured sources before launch and verifies their
bytes before success. It validates recovery contracts and writes public logs
with exclusive creation, then removes only its canonical marked temporary
root after allowed-file, no-link and single-hard-link checks. Success evidence
is written only after cleanup. Failure retains the runtime and prints its
local path. Earlier failed runtime directories are not cleaned by this step.

Two earlier attempts are preserved as source snapshots:

- [Attempt one](failed-attempt/manifest.json): `owned-process-not-present`.
  The writer's one-shot IPC listener allowed it to exit after arming, before
  the explicit fault. A persistent listener now keeps it alive until the kill.
- [Attempt two](failed-attempt-2/manifest.json): `deadline-child-close`.
  Survivor/replacement logs contained 300 records and end markers, but the
  PTY workers did not close. The explicit exit sequence used by the earlier
  harness replaced IPC disconnection alone. This attempt is not a completed
  recovery qualification.

Both failed runtimes remain local; their source snapshots are checked and
the second attempt's retained log hashes are recorded. No missing timing or
termination evidence is synthesized for them.

## Commands and prerequisites

Native Windows; host Node 26.7.0 / SQLite 3.53.4; existing S1 Electron 38.8.6 /
node-pty 1.1.0; Windows PowerShell. No dependencies are installed. From this
directory, with the committed evidence/logs present:

```powershell
rtk proxy npm run test
rtk proxy npm run check
```

`rtk proxy npm run probe` performs real process faults in a fresh owned
runtime, but refuses if `evidence-recovery.json` or `output/s5-recovery`
already exists. It never overwrites a cohort. A new native observation
requires a separately preserved artifact/source mapping. Failure reports
`Failed runtime retained:` followed by its local path.

## Delegation and remaining scope

The Codex relay attempted requested `gpt-6.1-luna` at max effort and received
an unsupported-model error for the current account. It produced no code.
The authorized OpenCode Space Bunny Free xhigh fallback supplied validator
and test code in its final response. Parent review reduced the oversized
proposal, corrected test cases, tightened the victim contract and added
native log checks, PRAGMA/FTS checks and recorded-evidence validation.
Muse Spark 1.3 Free xhigh supplied the separate design review. Neither
OpenCode run inspected or executed the workspace; native streams contained
zero tool calls. Parent implementation and execution establish the results.

Agy Gemini 3.8 Flash High was not dispatched under the recorded
[consumer-route restriction](../../../s4-provider-access/antigravity-consumer/README.md).
No provider/account substitution, credentials or model configuration change
was made. Delegate artifact and deliverable hashes are in `review-seal.json`.

This bounded feasibility result leaves full S5 partial. The product core,
renderer restart, whole-host death/orphan reaping, long-running recovery,
full-hour foreground input, resize/scroll quality, WSL and eligible provider
integration need separate evidence. Next: qualify renderer restart and
terminal/feed reconstruction in a separate cohort before claiming UI crash
recovery or starting those product recovery paths.

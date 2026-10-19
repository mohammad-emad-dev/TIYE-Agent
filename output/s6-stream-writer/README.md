# Protected bounded Windows stream writer

19 October 2026 · **8 Windows synthetic tests / 15 scenarios · Native disabled**

The new [writer](../../feasibility/s6-wsl/stream-writer/writer.py) implements the
byte-storage portion of the [native capture plan](../s6-native-contract/README.md).
It is a separate component, not a native launcher, JSON protocol parser or process
supervisor. The historical plan and sealed stores remain unchanged. Native
admission is false, L1/L2 PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD.

## Allocation and byte limits

The component reuses the original Windows directory/file creation, pinned-handle
and ACL-verification helpers. It does not call the old run's 64 KiB `write_bytes`
API. A fresh protected root/run is created before any feed, with explicit owner,
SYSTEM and Administrators grants. Ancestor/run handles omit delete sharing.
Each of four permitted files is created exclusively with a protected DACL;
open writer handles permit reads but deny another writer/delete-sharing request.
Actual handle ACLs, reparse/directory properties and single-link counts are
checked. This is current-Windows owner-account storage, not an administrator,
same-account or untrusted-code isolation guarantee. No alternate-token probe is
newly qualified by this cohort.

| Limit | Implemented behavior |
| --- | --- |
| Stdout | Retain at most 4 MiB |
| Stderr | Retain at most 1 MiB |
| Metadata | Retention and completion aggregate limited to 1 MiB; no generic metadata API |
| Total writer-owned capture | At most 6 MiB across the fixed file set |
| Feed chunk | At most 16 KiB per call; larger API inputs refused |
| Stdout record length | Incremental 256 KiB counter excluding LF, reset at each LF; no record-sized byte buffer |

Stdout and stderr share one lock. Fault checks, persistence, returned-byte
accounting and hashes occur within that lock, so another feed cannot persist
after the serialized fault transition. At a cap or record-length overflow, only
the remaining permitted prefix is offered to the file, the first fault is saved
and a Stop event is set. Every subsequent feed is counted as discarded without
disk persistence, including feeds from the other stream. The caller owns the
pipe readers and must continue bounded drain/discard during cleanup.

A short write retains and hashes only its returned prefix and faults without
retry. An OSError gives no trustworthy accepted-byte count: offered bytes are
classified **uncertain**, not silently counted as discarded. Previously returned
write counts remain distinct. The writer cannot establish actual storage effects
after an opaque I/O error. Later chunks are still discarded. No raw bytes, hashes,
paths, SIDs or exception messages are included in public case records.

## Completion and failure

Retention is written and flushed first and stays uncertain by default. Both EOFs
and no fault are required before `finish()`. The writer verifies held handles and
the exact inventory, fsyncs raw descriptors, checks sizes and incrementally reads
back hashes. Retention metadata is also checked against its original size/hash.
It then creates a bounded completion manifest exclusively, flushes and reads it
back, and rechecks metadata/security/inventory before setting in-memory completion.

The manifest describes **synchronous byte storage only**. It qualifies no provider
task, protocol exchange, process exit, descendant cleanup or product route.
It does not clear retention uncertainty or authorize deletion. A partial manifest
can remain after failure. Even a parseable complete manifest can remain when its
fsync fails; that measured case leaves completion false and Stop requested.
Neither file presence nor parseable JSON alone establishes successful finalization.
This component offers no reopen/recovery validator; a later controller must retain
the successful finalization/close outcome and review the complete capture before
using it. Close failures also invalidate the in-memory completion verdict.

Reader failure requests Stop. Missing EOF alone refuses finish, preserving the
open transaction for the trusted caller; it does not invent a process outcome.
Unexpected inventory, equal-size payload drift or retention drift refuses
finalization. No failure deletes evidence or spills to a public/unbounded log.
Closed, completed or EOF streams reject subsequent feeds.

## Measured scenarios

| Scenario | Actual check |
| --- | --- |
| Exact caps and protected files | Actual 4 MiB/1 MiB files, valid storage completion, aggregate budget and denied second writer while handles are held |
| Stdout and stderr overflow | Two separate cases, one byte beyond each cap; other stream persistence revoked and no completion |
| Record boundary | Exact fragmented 256 KiB plus LF and an empty record accepted; within-chunk one-byte overflow retains only the allowed prefix |
| Short write | Injected syscall wrapper actually writes eight bytes; actual size/hash/accounting match, no retry/completion |
| Write error | Injected ENOSPC before persistence; offered-byte uncertainty and global discard preserved; not real disk exhaustion |
| Raw fsync failure | Injected failure before completion; completion absent |
| Partial manifest | Actual eight-byte manifest prefix; JSON invalid, completion false |
| Completion fsync failure | Full parseable manifest retained but finalization fails and completion remains false |
| Reader failure / missing EOF | Incomplete transaction cannot finish; reader fault requests Stop |
| Inventory, retention and payload drift | Three fresh cases refuse finalization before completion creation |
| Concurrent finite child pipes | Two actual child producer threads and two parent readers; stderr exceeds its cap, both pipes reach EOF with counted discards |

The eight unittest methods cover fifteen scenarios. The short-write and fsync
faults are explicit OS-I/O boundary injections, not natural outages. The finite
pipe test deliberately drains a fixed synthetic output after overflow so it can
verify discard accounting. It does not implement production Stop/kill timing or
claim that a native child should continue working after a fault. Each test closes
its writer handles; raw capture files and the separate protected controller
diagnostic capture remain retained. No historical capture is reclaimed.

## Limits and next integration

The API accepts trusted byte chunks and owns its file handles. The caller owns
pipe handles, reader shutdown, joins and process lifecycle. A Stop event does
not interrupt a blocked filesystem call: serialization can stall both producers
and delay a reader-failure transition. Hard I/O deadlines and a supervisor
outside that blocking path remain unqualified. The fixture's child wait/join
timeouts are test bounds, not a native watchdog.

The writer checks record **length**, not JSON syntax, UTF-8, response correlation
or final LF. It uses no producer queue or full-stream accumulation, but does not
measure or guarantee process RSS, parser heap, kernel buffers or the planned
512 KiB allowance of a future integrated pipeline. Its byte caps are not a disk
quota against external writers. Metadata currently consists of fixed small
records; host journals or additional files must be included in the eventual
composition's aggregate budget, not added beside this capture unaccounted.

Reboot/power loss, close failures at every instruction, actual disk exhaustion,
hostile same-owner changes, privileged bypass, arbitrary filesystem races,
general concurrent callers, UNC/other filesystem variants, secure erasure and
automatic expiry remain unqualified. Retention/completion records are local
evidence, not signatures or a recovery authorization mechanism.

**Next:** compose this writer with the existing owned mock launcher and bounded
protocol reader, then qualify the new composition's Stop, overflow and uncertain
cleanup paths. Review the exact native candidate's startup/config/helper behavior
and deadline profile before a separate U0 admission. This component does not
retroactively promote the frozen native plan or any prior cohort.

## Evidence and verification

[Selected observations](observations.json) bind four new Python sources and the
two unchanged Windows helper modules. Full fixture states, paths and test logs
are retained in protected Windows storage. [Evidence](evidence.json) hashes the
public observations, report and [delegate dispositions](review.json). The saved
checker validates schemas and hashes, not a replay or attestation of private data.

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/stream-writer/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/stream-writer -p test_publication.py -v
```

Both commands are offline and launch no provider or WSL process. Two publication
tests reject private-field injection, missing/failed cases, source drift and
admission promotion. `--develop` runs fresh owned Windows synthetic fixtures and
retains protected evidence; selected output goes under `.git`. No native,
capture-replacement, historical purge or admission-creation mode exists.

Luna completed a supplied-context review. GLM timed out without a final report;
the authorized DeepSeek Free max fallback completed. Neither completed delegate
inspected final source or ran fixtures. Gemini remained excluded under the
recorded consumer-route decision. Development delegation is separate from this
synthetic component qualification. The parent applied Clean Code Guard, Test
Guard and Docs Guard; details and rejected review suggestions are in review.json.

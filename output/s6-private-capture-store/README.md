# Protected private capture storage

18 October 2026. Implements the bounded storage step from the
[access review](../s6-capture-access-review/NEXT-STEP.md). This new six-file source
cohort changes no historical launcher or capture bytes. It qualifies a Windows
storage prototype using synthetic children and payloads. It is not yet connected
to the Windows/WSL launcher. P1/P2 remain OPEN, Phase 1 HOLD, native admission off.

## Storage behavior

`CaptureStore` creates an exclusive UUID-named root directly under LOCALAPPDATA.
It pins existing ancestor directories with handles, rejects observed reparse
points, creates the root with a protected DACL, and verifies its owner and rules
through a held handle. New per-run directories follow the same policy.

The exact allowed principals are the process-token user, SYSTEM and
Administrators. Each receives full control; directories have object/container
inheritance flags. Raw files receive their own explicit protected DACL at
creation, rather than relying on file inheritance. File owner, type and exact
rules are checked before any payload bytes are written. Handles are not
inherited by the synthetic child. Existing roots, runs and files are refused
without retrofitting their security.

This uses the project's ctypes pattern and Windows
[CreateDirectoryW security attributes](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createdirectoryw),
[CreateFileW handles](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)
and [GetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo).
Descriptors are supplied at creation. There is no create-then-restrict interval.
The actual creation-to-open identity race is a separate limitation below.

The API accepts only four fixed filenames and at most 64 KiB per write/read.
Writes are exclusive, flushed and fsynced. This is a bounded storage prototype,
not streaming capture, crash-durable recovery or an encrypted vault.

## Retention and explicit deletion

Every run writes a protected retention record with logical owner, fixed synthetic
purpose, UTC creation time and an explicit-after-evidence-review deletion trigger.
It starts uncertain. A successful observed local child can add an exclusive
completion record; subsequent API writes are refused. Failed or unobserved child
completion cannot unlock deletion. Completion is a trusted-caller local fixture
record, not authenticated provider delivery or a general recovery transaction.

`delete_reviewed_run` requires the live store and reads the checked retention and
completion files through verified handles. It rejects extra filenames/types,
then deletes only known files. Payloads go first; completion and retention records
come last. Errors propagate. Deletion is not atomic: earlier files can be gone
if a later removal fails. The failed-cleanup test locks the first payload and
requires payload, completion and retention to remain before an explicit retry.
The pinned directory itself remains until close; the fixture then removes its
known empty directories using nonrecursive operations.

No timer deletes evidence. Uncertain and failed test captures stay in their
protected LOCALAPPDATA roots for review. Existing-path fixtures are also retained
because they have no completion record. This is deliberate retention, with no
TTL, quota, backup deletion or automatic reclamation. Parent-handle close is not
evidence deletion.

## Eight Windows cases

| Case | Measured behavior |
| --- | --- |
| Owner I/O | Parent descriptor snapshot, protected root/run/file descriptors, actual local child status 0, owner write/read and explicit reviewed cleanup |
| Permission failures | Injected CreateDirectoryW denial and GetSecurityInfo denial refuse a run before payload creation |
| Existing paths | Existing root/run/file creation refuses; prior retention bytes, raw canary and descriptor remain unchanged |
| Owner mismatch | Actual descriptor queried against a deliberately different expected owner; new run is refused |
| Junction | Real Windows junction, held-handle reparse refusal, existing-path refusal and unchanged target marker |
| Uncertain retention | Real child status 7 and retained partial output; completion and deletion refused |
| File query failure | A newly secured empty file remains when its security query is denied; no raw payload bytes are written |
| Cleanup failure | Real no-delete-sharing file handle blocks deletion; error/retention survive, explicit retry succeeds after unlock |

Injected failures replace only the Windows API boundary, not storage validators.
The remaining ownership, reparse, read/write, completion and cleanup observations
use actual Windows objects. The owner-mismatch case is not another user's token.
Three offline publication tests additionally check saved integrity and rejection
of raw fields, account-name values and unexpected private-path metadata.

## Publication boundary

Raw canaries, physical private paths, account names and SIDs are not exported.
`publication.py` accepts the exact eight-case verdict schema and normalized
security records. Unknown fields/principal strings and failing verdicts refuse
publication. The successful tests log, selected observations and frozen source
hashes are retained in this public evidence cohort. There is no recursive raw-tree
copy or automatic export of future captures. The parent reviewed the selected
fields and report before Git synchronization.

## Limits and admission

No alternate-user or restricted-token file-open test was available or performed.
The protected DACL and owner operations are measured; denial for a different
ordinary account remains unqualified. No protection is claimed against the same
user, administrators, SYSTEM, backups or malware running with those authorities.
Parent/ancestor permissions are not certified as a complete access boundary.

No hostile-filesystem qualification was performed. Existing components are
opened without delete sharing and observed reparse points refuse, but directory
creation and opening are separate path-based operations. File/parent identity
replacement, security changes by an authorized actor, and cleanup races remain
outside this guarantee. The code does not reopen existing stores after restart;
recovery, concurrent writers, alternate filesystems and power loss are untested.

The prior broad `.git` ACLs are unchanged. This step moves new raw fixture bytes
to a protected location; it does not repair, erase or reclassify previous logs.
Linux mode/ACLs, shared-UID credential/socket/keyring/network reach, provider
permission and source-bound native admission remain separate requirements.

All requested delegation routes were attempted: GPT-6 Luna max timed out,
GLM-5.3-Flash Free max failed without a final report, and DeepSeek V4.1 Flash Free
max timed out. No delegate implementation or completed independent review was
used. The parent implemented and verified this cohort. The recorded consumer
Gemini exclusion remains in force. Codex also emitted ambient MCP authentication
warnings despite the isolation option; delegate activity has no network-silence
claim. Private relay hashes/statuses are recorded in [review.json](review.json).

## Verify

Default verification is offline and creates no capture directory or child:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/private-capture-store/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/private-capture-store -p test_publication.py -v
```

On Windows, `--develop` runs a new synthetic storage qualification and saves only
selected evidence beneath `.git/tiye-private-store-development`. `--capture`
requires this report and review, and refuses existing input. `--native` refuses
before tests. The actual raw files use LOCALAPPDATA in both modes.
The source/artifact hashes are integrity references, not signatures or permission
proof. See [input](input.json), [observations](observations.json),
[tests](tests.log), [evidence](evidence.json) and [next step](NEXT-STEP.md).

# S6 supervised private mount and retained evidence

The fixed initialize fixture now runs on a private, limited tmpfs within the
existing Windows/Ubuntu supervision flow. No native candidate or model request
is executed by this harness.

## Integrated behavior

The service worker executes `unshare` without a fork option, preserving its
systemd MainPID. It verifies the exact UID/GID mapping from namespace root to
host account 1000 and private mount propagation. The fresh tmpfs has a 2 MiB
capacity, 64 inodes and `nosuid,nodev,noexec` flags. The separate-session Python
leaf verifies its actual post-exec zero capability sets, `NoNewPrivs=1`, hard and
soft 64 KiB file limit, and zero core limit before initialization succeeds.

An abstract UNIX sequenced-packet socket transfers one CLOEXEC directory
descriptor to the independent observer. The observer checks peer UID/GID,
nonce, descriptor count, truncation flags, directory identity, filesystem type,
mount flags, capacity and initial inventory. The peer PID must subsequently
match the independently checked service MainPID. Ready is emitted only after
the active fixture inventory is verified. The ordinary host path is separately
checked against the original empty directory identity; it does not expose the
private mounted content.

After both held pidfds signal and the service cgroup is empty, the observer
still reads the same mounted filesystem through the held descriptor. It copies
the complete fixed allowlisted tree to a fresh private directory on another
filesystem. Source and destination traversal use directory-relative no-follow
opens. File contents, sizes, permissions, owners and exact alias targets are
checked; files and directories are synchronized and copied bytes read back.
The copied inventory must equal the source inventory before and after copying.
Nothing is overwritten on a destination collision.

The original observer then exits. A separate fixed verifier reopens the retained
directory and compares its complete inventory digest with the private report.
The integration earns retention credit only after this second process succeeds.
Retained paths, process identities and diagnostics remain in protected local
captures; public observations contain selected verdicts only.

The descriptor semantics and independent filesystem-type check use the Linux
[UNIX socket interface](https://man7.org/linux/man-pages/man7/unix.7.html) and
[filesystem statistics interface](https://man7.org/linux/man-pages/man2/statfs.2.html).
The small ctypes `fstatfs` binding is qualified on this Ubuntu Linux setup,
not offered as a portable native ABI wrapper.

## Verification

| Actual lifecycle case | Linux cleanup and retained copy | Overall cleanup outcome |
| --- | --- | --- |
| Owner exits | Verified, including reopen after observer exit | cleanup-observed |
| Heartbeat stalls | Verified before Windows fallback | cleanup-observed |
| Guardian is killed | Verified, including reopen after observer exit | unknown |

Guardian loss retains the unknown Windows Job result. Observed Linux cleanup
and a retained copy do not establish Windows Job emptiness. The unrelated Linux
sentinel survives each observed cleanup.

One additional test uses real descriptor transfers for seven parser rejection scenarios:
wrong nonce, extra descriptors, regular-file descriptor, truncated message,
truncated ancillary data, rejected peer credentials and duplicate JSON fields.
Every received descriptor exposed to the parser must be closed on rejection.
The credential mismatch is supplied in the test envelope; the three service
cases use actual kernel peer credentials.
The same suite checks retained-directory collisions, unknown nodes, oversized
files and intermediate directory symlinks. Failure must occur for the expected
reason, rather than an unrelated exception.

Four development tests run in total: three lifecycle cases and one rejection
suite. Normal and optimized Windows Python are checked. The Linux fixtures use
isolated Python `-I -S -B`; Linux optimization mode is not qualified here.
Earlier byte/inode exhaustion and privilege-refusal evidence remains separately
bound through the [runtime-limit checkpoint](../s6-runtime-limits/README.md).

From the repository root on the qualified Windows/Ubuntu setup:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/limited-observer/check.py
```

This verifies saved source/artifact/reference hashes and verdict schemas without
execution. Add `--develop` to run the four fixed tests again. Failed development
runs keep diagnostics privately and do not publish a passing record. Hashes are
local consistency checks, not signed provenance.

## Limits and remaining work

The tmpfs bound applies to this designated filesystem. Other host paths and
nested namespaces remain possible; there is no process-total disk/RSS quota or
general sandbox claim. The supervisor retains user-namespace capabilities and
could resize its mount; only the fixture leaf is restricted.

The existing charged service content ledger remains 128 KiB, with its original
disjoint owner allocations and reserve. Retention has a separate 128 KiB content
cap per traversal/copy, at most 64 nodes and 64 KiB per regular file. Repeated
verification passes are not a lifetime gross-allocation budget. Retention
metadata/allocated blocks are not covered by that content cap. Windows capture
still uses the existing charged collector partition.

The shared schedule, 1-second Linux lease, 20-second service maximum, 2-second
stop timeout and 5-second Windows guardian remain in use. The extra retained-copy
verifier runs inside the observed adapter operation and earns no credit past its
shared cutoff. Its fixed-output subprocess buffering is not an arbitrary-RPC
capture mechanism. A timeout does not establish that an arbitrary Linux verifier
process tree has been killed.

This is successful post-ready retention of **known synthetic content**. There is
no independent mount holder/broker if the observer dies. Startup interruptions,
copy failure, observer death and unknown native-state quarantine remain
unqualified. A failed copy can leave a private partial directory; it is not
reported as complete and is not automatically deleted. Completed copies and the
original empty host mountpoints also remain for inspection. Retention is on the
backing filesystem, without a reboot-survival or power-loss guarantee.

No native admission is granted. L1/L2 remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and
Phase 1 HOLD. C0 configuration observation and final-PATH observation remain
separate pending work; the U0 initialize/initialized packet contract is unchanged.

Next: make retention survive observer loss before admitting unknown native state,
then complete the separate C0 response validator and effective-PATH observation.

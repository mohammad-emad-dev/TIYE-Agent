# Synthetic owner preparation protocol

## Trusted setup

The coordinator constructs a `PreparationOwner` with existing source and
destination directory descriptors and an `OwnerContext`. The context holds the
session, generation, owner epoch, an enrolled `PeerPin`, and `StoppedWriters`.
This setup is trusted in-process code. The handler does not accept enrollment,
process IDs, descriptors, device/inode identities or worker-stop claims over IPC.
The owner retains independent directory descriptions until explicit close.

`PeerPin` captures process start ticks and uniform real/effective/saved/filesystem
UID/GID values, holds a pidfd, and checks the identity while that pidfd remains
unsignaled. Connection checks require exact `SO_PEERCRED`, a live
`SO_PEERPIDFD` whose fdinfo identifies the enrolled process, and another live
held-process check. This uses the existing x86-64 Linux UAPI option 77; other
architectures or unsupported kernels refuse without a PID-only fallback.

The listener must enable `SO_PASSCRED` before accepting requests. Every received
packet must carry exactly one kernel `SCM_CREDENTIALS` record matching the enrolled
live process. This refuses sends from a child using its parent's connection. It
does not prevent another process from reading a reply on a deliberately inherited
or passed connection. The fixture establishes request-sender authentication, not
exclusive reply-recipient identity or mutual authentication of a final product
client. The actual keeper's enrollment and client trust setup remain separate work.

## Request and ordering

One AF_UNIX/SOCK_SEQPACKET message contains UTF-8 JSON with exactly these fields:

| Field | Required value or bound |
| --- | --- |
| event | `prepare-synthetic-export-v1` |
| session | Exact enrolled 32-character lowercase hex session |
| generation | Exact enrolled integer, 1 through 2^31 minus 1; booleans refused |
| ownerEpoch | Exact enrolled 32-character lowercase hex epoch |
| nonce | 32-character lowercase hex request nonce |
| paths | 1–64 explicit portable relative file paths |
| byteBudget | Integer 1–131072; booleans refused |
| validForSeconds | Integer 1–60; request/grant lifetime metadata |

The existing [request contract](../s6-export-grant/REQUEST-CONTRACT.md) supplies
path, per-file, aggregate and manifest limits. The adapter also refuses case
aliases between ancestor directory names. Input and output packets are each at
most 16384 bytes. Duplicate JSON members, nonfinite numbers, invalid UTF-8,
truncation and extra fields refuse the whole operation.

No descriptor transfer is accepted. Any installed SCM_RIGHTS descriptors are
collected and closed before refusal, including when ancillary data was truncated;
the kernel discards undisclosed excess rights. No partial manifest is sent.

The owner serializes operations with one lock. The sequence is:

1. Start a two-second monotonic deadline and acquire the lock within it
2. Authenticate the connection and receive one bounded, credential-bearing packet
3. Validate the exact session and selection metadata, then authenticate again
4. Refuse an already spent nonce or a full 64-entry owner-lifetime ledger
5. Spend the nonce before fallible custody checks and content measurement
6. Verify current source/destination identities and fresh stopped-worker evidence
7. Prepare the bounded manifest through retained directory descriptors
8. Recheck custody, stopped-worker evidence, requester liveness and the deadline
9. Send the exact synthetic manifest within the remaining socket deadline

There is no eviction, response cache, automatic retry or saved-state restoration.
Wrong peers, invalid schemas and session mismatches cannot spend nonces. After
step 5, any failure leaves the nonce spent, including a lost response, requester
death, live/repopulated workers, missing source or deadline expiry. A new owner
does not restore prior state or gain historical custody credit.

The deadline covers lock wait, receive, validation, preparation and send through
remaining-time checks. It cannot interrupt a blocked regular-file read. An overdue
read cannot subsequently produce a successful reply. The test service has its own
45-second runtime limit and two-second stop timeout; neither qualifies a final
product watchdog or a persistent custody guarantee.

## Fresh stopped-worker evidence

The coordinator supplies original worker pidfds and a cgroup directory pinned
before the test workers start. `StoppedWriters` duplicates the pidfds, refuses
non-pidfd descriptors, and retains an independent cgroup directory description.
Both gates require:

- Original cgroup device/inode identity and cgroup-v2 filesystem magic
- All original worker pidfds readable/signaled
- A fresh fd-relative, nofollow read of `cgroup.events`, at most 1024 bytes
- Exactly one `populated` and one `frozen` LF-terminated integer field, each 0 or 1
- `populated` exactly 0, followed by another identity and pidfd check

Missing, removed, unreadable or unsupported evidence refuses; absence is never
interpreted as empty. An exited parent alone cannot establish descendant exit.
Repopulating the group is refused even when all original worker pidfds signaled.
These are observations before and after hashing, not an atomic snapshot or
exclusive control against hostile same-user writers or cgroup administrators.

## Result

Success sends the existing `synthetic-export-plan-v1` request with measured file
sizes and digests and owner-derived directory identities. It grants no consent,
copy, grant minting/consumption, release, deletion, retry, native execution or
admission rights. Failure raises `ValueError`, `OSError` or `TimeoutError`; the
owning loop must close the accepted connection and preserve uncertainty. No new
error-to-success fallback or release handler is introduced.

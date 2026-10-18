# Consolidated launcher access review

18 October 2026. Subject: commit `f8bc257`, the
[consolidated mock launcher](../s6-consolidated-launcher/README.md).
This review binds all 20 launcher sources and all 136 saved capture files.
It adds current metadata observations without modifying or repeating that run.
**P1 and P2 remain OPEN, native admission remains disabled, Phase 1 remains HOLD.**

## What we found

| Area | Evidence | Conclusion |
| --- | --- | --- |
| Windows capture permissions | Current owner/DACL metadata for 136 files, the capture directory and two private-log parent directories: 139 targets | Every sampled DACL is inherited and unprotected; all contain Allow entries for Authenticated Users and Users. These directories do not establish an owner-only storage boundary |
| Linux retained paths | Current `lstat` of nine recorded temporary roots and eight fixed child paths per root | All roots and sampled children are absent now. The frozen teardown does not delete those roots; today's absence does not establish historical deletion, its timing or cause |
| Linux host mount | Current metadata for `/mnt/d`: directory, mode `0777`, owned by probe UID | The mountpoint exists in the observer's namespace. This is not an effective-access check of Windows files from the historical service |
| Ambient access | Frozen launch code uses the same Windows account and Linux UID 1000, reduced environments and a fresh Linux HOME | No filesystem, network, keyring or socket confinement was established. Clearing environment values does not remove account permissions |
| Capture retention | Public capture includes raw stream files, embedded base64 streams, identities, paths, journals and diagnostics | Synthetic protocol payloads do not make all provenance metadata anonymous. Publication requires explicit review |
| Private development assistance | Delegation/development logs reside beneath `.git`; only their parent DACLs were sampled | Git exclusion controls publication, not local read access. No automatic deletion policy is implemented here |

The observed Authenticated Users direct-entry mask is `0x001301bf`; Users is
`0x001200a9`. Administrators and SYSTEM also have inherited grants. Full numeric
masks and inheritance/propagation flags are retained in
[measurements.json](measurements.json). These are normalized access-rule records,
not a Windows Authz calculation. Other policy, token memberships, deny rules,
share permissions and actual open operations can affect effective access.
No alternate-account open test was performed.

## Evidence boundaries

**Historical source:** `test_unified.py` uses `umask(0077)` and a `/tmp` mkdtemp
root; `entry.py` creates fresh directories and requests service UMask 0077,
LimitCORE 0 and lifecycle properties. `host.py` reduces the normal subprocess
environment. `worker.py` retains the account UID and further narrows peer/leaf
environments. The independent observer runs outside the service. These controls
are visible in the sealed source. They do not prove runtime permission denial.

**Current metadata:** the new collector reads Windows security descriptors and
Linux `lstat` metadata only. It does not open credential files, list home or
private-log contents, enumerate environment values, connect to keyrings/sockets
or make network requests. Its WSL process is an observer, not the historical
service. Missing paths are observations, not successful cleanup assertions.
Permission errors fail capture rather than becoming a missing/empty result.

Windows principal names/SIDs are omitted. Recognized principals map to role
names; unknown principals remain separate ACE rows labeled unclassified.
ACE order, masks and flags remain visible, but that normalization loses identity
distinctions and is insufficient to reconstruct a descriptor. Absent, null and
present DACL states are distinguished. No local account names are needed in
this new artifact. Existing published provenance remains byte-for-byte intact.

Linux `lstat` does not follow the final path component. Parent-component races,
POSIX ACLs, mount semantics and hostile filesystem changes are not qualified.
Directory mode 0700 would restrict other ordinary UIDs under basic DAC, not the
same UID or privileged access. No current or historical effective-access result
is claimed for these paths.

**Retention/publication:** all 136 existing capture files are listed and hashed
in the review manifest; `.bin` streams and JSON-embedded raw bytes are retained.
Their Git publication follows the project's standing synchronization instruction;
this review does not independently re-query remote visibility or erase history.
Private delegate raw logs remain outside the deliverable. No expiry, encryption,
backup removal or Git-history removal is implemented. Neither hashes nor Git
exclusion enforce confidentiality.

## Delegated review and decisions

GPT-6 Luna at max proposed the evidence schema and negative tests. GLM-5.3-Flash
Free at max completed the ambient-access review at reported cost $0; fallback
was unnecessary. Its suggestions to publish SIDs and environment-value lengths
were declined: role labels and existing static environment declarations suffice.
Its statements that shared-UID access always succeeds, administration capabilities
were present, or native refusal is permanent were not accepted as evidence.
Filesystem permissions may deny some resources; capability state was not measured;
native admission is disabled in this cohort, not a permanent product decision.

The recorded consumer Gemini route remains excluded from delegation/integration
and was not dispatched. Codex emitted an ambient Higgsfield MCP authentication
warning despite the isolation option; raw logs remain private. Development
assistance is separate from the collector: no claim of network silence is made
for the delegate process. Delegate reports are advisory; their stale metadata
assumptions and file counts were replaced with the actual capture inventory.

## Next implementation

Implement a **protected private capture store for future runs**, before any native
capture. Keep historical sources/artifacts sealed. The acceptance contract is in
[NEXT-STEP.md](NEXT-STEP.md). Storage permissions alone will not close P1: a
separate bounded same-account access and confinement qualification is required.

## Verify offline

From the project root:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/capture-access-review/check.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/capture-access-review -p test_check.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/consolidated-launcher/run.py
```

The access checker binds its source inventory, current measurements, the pinned
historical evidence digest and the complete subject manifests. It rejects scope
promotion, missing targets, changed content and path escapes. It does not certify
permission isolation or cryptographic authenticity. An actor able to rewrite the
checker and manifests can rewrite the assertions. Capture is exclusive and
requires Windows/Ubuntu; `capture.py` refuses an existing measurements file.

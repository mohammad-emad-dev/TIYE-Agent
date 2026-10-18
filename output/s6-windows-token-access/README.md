# Windows restricted-token effective access

18 October 2026 · **20 paired live requests · P2 OPEN · Native admission BLOCKED**

The protected Windows capture allocator now has an actual same-account
restricted-token access measurement. This cohort uses the unchanged allocator
and new synthetic objects. It does not modify earlier sources or captures and
does not test a different Windows user, administrator isolation or a native CLI.

## What ran

The owner creates a protected capture root/run and synthetic payload/retention
files using the existing allocator. Its DACL grants the owner, SYSTEM and
Administrators full access. Paired control roots/runs/files on the same volume,
at matching depths beneath the same parent, add one full-access RestrictedCode
ACE. Their explicit protected descriptors are checked. A further protected file,
created and verified through the original allocator helpers, shares exactly the
same RC-accessible parent as its grant-control file. This isolates the leaf-file
comparison from differences between protected and control parent descriptors.

An isolated Python worker starts without inherited capture handles and creates
a restricted version of its own process token. It does not log in, create an
account, change the parent process token or inspect credentials. Before the probe
and after reversion the ordinary owner opens every protected/control path with
each requested right. The trusted worker impersonates only around the measured
open matrix. This is a test instrument, not containment for untrusted code.

| Protected target | Matching control | Explicit requested rights |
| --- | --- | --- |
| Capture root | Control root | List directory, add file, READ_CONTROL, WRITE_DAC |
| Capture run | Control run | List directory, add file, READ_CONTROL, WRITE_DAC |
| Capture stdout | Control stdout | Read data, write data, READ_CONTROL, WRITE_DAC |
| Capture retention | Control retention | Read data, write data, READ_CONTROL, WRITE_DAC |
| Protected leaf under control run | Sibling control stdout | Read data, write data, READ_CONTROL, WRITE_DAC |

All **20 protected OPEN_EXISTING requests fail with error 5**, while their
**20 matching control requests succeed**. Other error codes, missing controls or
token-witness changes fail the qualification. Opens use fresh handles, identical
sharing/disposition/flags within each pair and no-follow reparse handling. No
successful handle is reused across attempts. No byte writes, ACL changes,
directory creation or enumeration are attempted under impersonation; the rights
are requested at open. DELETE and WRITE_OWNER are not qualified. The original
payload, retention and protected-leaf bytes are unchanged afterwards.

## Token witness and interpretation

The worker requires an initially unimpersonated thread and an unrestricted base
token. It calls CreateRestrictedToken with DISABLE_MAX_PRIVILEGE and exactly one
restricting SID, RestrictedCode. Before and after every protected/control pair it
opens and queries the actual thread token. The user remains the owner, token type
is impersonation with sufficient level, restricting SIDs match exactly, and the
only enabled privilege is SeChangeNotifyPrivilege. Token identity is stable
throughout the matrix. The allowed privilege's LUID is resolved before
impersonation and compared against actual token entries during the probe.

Windows requires the normal and restricting-SID checks to both allow requested
access. The normal owner identity is unchanged; this test exercises the additional
restriction check. DISABLE_MAX_PRIVILEGE preserves SeChangeNotifyPrivilege; it
is not a removal of every privilege. These choices follow Microsoft's
[CreateRestrictedToken contract](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken).
The retained privilege bypasses traversal checks; it does not grant directory
listing. See Microsoft's [privilege definitions](https://learn.microsoft.com/en-us/windows/win32/secauthz/privilege-constants).
The sibling leaf comparison supplies a direct same-parent control as well.

Impersonation success is checked before work. RevertToSelf runs in a finally
block; a failed revert terminates this worker immediately with code 97. The
successful path also verifies the thread token is absent and repeats owner opens.
This follows [Microsoft's reversion guidance](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-reverttoself).
The failure-exit branch was reviewed but not artificially forced in this cohort.

## Development findings and limits

Two exploratory workers failed and were not counted as qualifications. A proposed
zero-desired-access visibility check was denied, so it supplies no visibility
evidence. A privilege-name lookup failed while impersonating; resolving the known
LUID before impersonation avoids that lookup while retaining actual per-open
token checks. Failed raw captures remain private. The final cohort retains all
20 required denials, controls and owner baselines; no successful result is inferred
from the failed exploratory runs.

This measures one restricted token on the current Windows configuration. It does
not establish another account's effective access, UAC/admin/SYSTEM isolation,
AppContainer behavior, provider credential isolation or filesystem confinement.
The worker retains its unrestricted primary token and can deliberately revert;
that is why this trusted probe is not a sandbox. Owner/SYSTEM/Administrators are
explicitly permitted by the store. Reparse points are refused, but hostile races,
filter-driver behavior, arbitrary privileged bypass and other OS builds remain
unqualified. Owner/control successes rule out several simple false-denial causes;
they do not exclude every environmental influence.

P2 remains OPEN for actual launcher integration, retention/recovery and other
unqualified privacy boundaries. The Linux storage seal remains storage-only.
P1 remains OPEN, A1 BLOCKED and Phase 1 HOLD. No historical ledger is promoted.

## Evidence and verification

Three new Python sources and the two original allocator modules are hashed.
The isolated worker's raw report/stderr are written to a separate protected
Windows capture allocated before spawn. Paths, owner SID, token IDs, canary hash
and per-pair token records remain private. New protected subject objects and
synthetic RC-granted controls are retained locally for review. No deletion or
expiry mechanism is added. Private `.git` development logs are excluded from Git
publication but do not acquire a protected ACL merely from that exclusion.

Public output is newly constructed from selected target/right verdicts and fixed
limits. Four offline tests reject wrong failure codes, missing controls/baselines,
invalid or changing token witnesses, private-field injection and admission
promotion. Saved checks validate selected schemas and source/artifact hashes;
they do not replay private evidence or attest against a malicious repository edit.

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/windows-token-access/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/windows-token-access -p test_publication.py -v
```

`--develop` creates a fresh synthetic measurement and selected `.git` output.
`--capture` requires this report/review and refuses an existing input file.
`--native` refuses before fixtures. The runner uses native Windows and no provider
or WSL process. Its private raw file limit is the allocator's 64 KiB prototype
limit; capture buffering is not a general streaming quota.

Luna and GLM supplied reply-only design reviews; neither reviewed final source
or ran the live measurement. We adopted paired opens, token witnesses and
same-parent leaf controls. We rejected GLM's claim that SeChangeNotifyPrivilege
is removed and Luna's statement that both access checks must fail: the additional
restriction check is sufficient to deny. The recorded Gemini exclusion remains
in force; no fallback was needed. See [review](review.json), [results](observations.json),
[evidence](evidence.json) and [next step](NEXT-STEP.md).

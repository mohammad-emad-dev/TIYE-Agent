# Private mock lifecycle matrix

18 October 2026. Completes the nine-scenario lifecycle extension in the
[private launcher brief](../s6-private-launcher/NEXT-STEP.md). All nine frozen mock
paths now share the protected allocation, retention, file audit and selected
publication path. This is not native admission or completion of the product.
P1/P2 remain OPEN, L1/L2 PARTIAL, A1 BLOCKED and Phase 1 HOLD.

## Source and execution scope

This is a new measured source fork of the six-file private adapter. The original
20 consolidated launcher files and six storage-prototype files remain unchanged.
The assembled fingerprint binds those inventories and the six new adapter files:
32 sources in total. Only the storage prototype's store/ACL modules execute here;
its other sources are bound references. Profile/mode groups and synthetic-write
size are compared with the frozen launcher before running the suite.

The inherited full lifecycle validator still checks actual wire correlation,
peer phase/receipt behavior, held Windows process handles and Job emptiness,
independent Linux pidfds/cgroup/absence/sentinel observations, cleanup bounds and
same-path restart refusal. Bundle hashes and the assembled fingerprint must match
before the adapter seals any private record. The service/runtime/watchdog profile
is unchanged. No native binary, provider authentication or inference is launched.

## Nine lifecycle scenarios

| Scenario | Private file count | Required outcome |
| --- | ---: | --- |
| Valid | 17 | Actual handshake, peer EOF receipt/reap and clean tree |
| Foreign response | 17 | Correlation refusal; no initialized notification |
| Invalid UTF-8 | 17 | Exact raw bytes retained privately; parser refusal |
| Pending Stop | 20 | Notification revoked; identity-bound Stop, not lease fallback |
| Owner loss | 14 | Dead owner has no protocol report; unknown delivery |
| Transport loss | 17 | Client loss, retired heartbeat and independently observed cleanup |
| Pressure Stop | 21 | Started/pending third write cancelled; delivery uncertain |
| Pressure owner loss | 15 | Pending-write witness retained; no invented host result |
| Pressure transport loss | 18 | Third-write uncertainty and local stdin abort retained |

Mode-specific inventories add `pressure-ready.json` on the three pressure paths
and Stop files on both Stop paths. Both owner-death modes must lack host protocol
reports/stream files. The frozen observer's raw evidence remains private and is
not confused with those absent host-generated files.

Each pressure case attempts an 8 MiB **synthetic plumbing write**. The selected
verdict requires the actual started/pending drain witness and two samples above
the high watermark. Pressure Stop requires `uncertain-write-cancelled`; transport
loss can retain either uncertain writer outcome allowed by the source validator.
Owner death retains `unknown-owner-dead` with no stdin-abort result. Delivery stays
unknown. None of this establishes native frame capacity, throughput or delivery.

## Private storage and publication

Protected LOCALAPPDATA root/run descriptors and unchanged intent bytes are checked
before the inherited harness starts children. Known Windows config, journals,
streams and diagnostics are routed there. Ordinary producer files inherit only
the current process user/SYSTEM/Administrators grants; adapter records get explicit
protected DACLs. The final held-file audit checks exact names, owner, type, rules,
content size and hashes. Journal replacement temps are created in the same private
directory. Final permission-query or inventory failures refuse publication.

The contract retains post-run limits of 8 MiB per file and 32 MiB per case. These
are not a live disk quota. The unrelated 8 MiB write size has a separate contract
field, and the transport retains its existing 4 MiB stdout/1 MiB stderr limits.
No 8 MiB pressure payload is saved in accepted captures. Overflow, arbitrary
diagnostic growth and adversarial writers do not gain acceptance from this claim.

`retention.json` starts with launch intent/unknown delivery before execution.
`private-evidence.json` keeps full raw/base64/path-bearing records;
`storage-audit.json` keeps file hashes and normalized permissions, excluding its
own recursive hash. A separate final audit includes that audit file. The private
witness calls a retained host report a report, not task completion. All captures
remain retained, including cancelled, uncertain and failed ones. There is no
deletion API, TTL, automatic retry, reclamation or recovery transaction here.

The public selector constructs fixed booleans, counts and outcome enums. It
publishes no private paths, raw streams or embedded base64. Offline checks verify
the selected schema and exact source/artifact hashes, not a replay of inaccessible
private evidence or a new Windows access calculation. Hashes are not signatures.

## Guard coverage

Four live storage guards accompany the nine actual lifecycle cases:

- GetSecurityInfo denial prevents allocation from reaching Popen
- Actual changed intent bytes refuse the prelaunch gate before Popen
- A complete synthetic file inventory passes its audit, then an added unexpected
  filename causes refusal
- An actual private file sized 8 MiB plus one byte causes refusal at the metadata
  size check before content reading/publication

The rejected oversized fixture is retained privately; it is not an accepted
over-budget capture. Gate fixtures use synthetic placeholder bytes and no CLI.
Only the intentional security/process API failures are mocked. Six offline tests
cover integrity, raw/path field injection, both dead-owner promotions, pressure
delivery/control/native-capacity promotion, missing/oversized verdicts and
admission/privacy assessment promotion.

## Admission reassessment

| Requirement | Current status | Credit from this cohort | Remaining boundary |
| --- | --- | --- | --- |
| L1 — reviewed launcher | Partial | Nine mock modes use the same assembled source/contract and private allocation path | Native executable/input/path/argv admission is not integrated or exercised here |
| L2 — interruption/one attempt | Partial | Combined Stop/loss/pressure witnesses and fixed-path restart refusal | Mock scope; journal is single-owner/fixed-path, not global or power-loss recovery |
| P1 — ambient access | Open | Reduced environments and shared identities remain explicit | Source-bound filesystem/credential/helper/keyring/socket/network reach review and decision |
| P2 — capture/publication | Open | Protected Windows storage, exact final-file audits, private raw retention and selected publication | Alternate-token denial, Linux storage/modes, retention/recovery and hostile-path limits |
| A1 — native admission | Blocked | Zero native runs and explicit refusal | Separate source/binary/input-bound decision after unresolved requirements |

[assessment.json](assessment.json) fixes these states and the nine qualified case
IDs to this fingerprint. Historical ledgers remain unchanged. The four local
consolidated guard tests (candidate preparation, native flag, partial journal and
cleanup-hook failure) were not rerun as part of this matrix. Their earlier saved
evidence stays valid for its own scope; it is not promoted into native permission.

Same-user/admin/SYSTEM access, alternate-token denial, hostile filesystem races,
Linux UID/mode restrictions and ambient credentials/network are unqualified.
All fixtures are synthetic. The Windows observer's inherited working-directory
behavior and original Linux temp behavior remain; routed files do not imply a
filesystem sandbox. A delayed/mismatched cleanup remains a failed capture, not a
reason to weaken an audit or publish a clean verdict.

GPT-6 Luna max and GLM-5.3-Flash Free max completed reply-only contract reviews.
Neither audited final source or ran the tests. Their conditional inventory and
dead-owner concerns informed profile binding, actual inventory assertions and
pressure schema checks. A suggested link between delayed Linux cleanup and
Windows inventory overflow was not assumed: Linux/Windows witnesses are separate,
and full lifecycle validation precedes the final Windows audit. Fallback was
unnecessary. The recorded consumer Gemini exclusion remains; Codex's ambient MCP
auth warnings remain private, with no network-silence claim for delegation.

## Verify and continue

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/private-matrix/run.py
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/private-matrix -p test_publication.py -v
```

Default verification is offline. `--develop` creates new selected evidence under
`.git/tiye-private-matrix-development`; raw captures still use protected
LOCALAPPDATA. `--capture` requires the report/review and refuses existing input.
`--native` refuses before fixtures. See [input](input.json),
[selected observations](observations.json), [tests](tests.log),
[evidence](evidence.json), [review](review.json) and [next step](NEXT-STEP.md).

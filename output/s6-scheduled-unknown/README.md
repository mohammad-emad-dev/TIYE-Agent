# S6 unknown ownership through Windows supervision

Copy refusal now travels through the existing shared Windows/Ubuntu phase
schedule as an unknown result with retained ownership. The Linux observer stays
alive with its keeper pidfd. The Windows adapter retains its observer process,
capture readers and held process handles until explicit fixture settlement.

This checkpoint executes only fixed synthetic fixtures. Native execution and
admission remain disabled.

## Custody and observation

The composed runtime reuses the sealed supervised keeper and its refusal policy.
The keeper owns the mount before producer acknowledgement. An empty unexpected
fixture file causes bounded inventory to refuse copying and creates an exclusive
unknown receipt. The observer validates the complete receipt against its nonce,
original keeper identity, service invocation, startup and mount identity. Receipt
booleans are checked through canonical JSON so integer `1` cannot stand in for
`true`.

The observer probes the keeper's administration endpoint and checks its original
pidfd and full live identity. It closes its duplicate mount and control socket,
then probes again and verifies that the receipt is unchanged. Only then does it
publish the held unknown result. This extends the existing custody handshake;
it does not make custody durable against keeper failure.

The observer independently confirms worker pidfd exit, absent original process
entries, empty worker cgroup and terminal lease evidence. Windows checks its
actual held worker processes and guardian/Job result. These observations do not
constitute a retained copy. The selected witness explicitly withholds full
verification and unrelated Linux sentinel credit, causing the unchanged
coordinator to keep `outcome: unknown` and `cleanupVerified: false`.

## Explicit fixture settlement

Observation does not close the live holder. `close_settled` refuses to close the
adapter before qualified fixture disposal, including when observer exit leaves
ownership unconfirmed. No generic finalizer may authorize disposal.

After the scheduled observation finishes, the test harness explicitly invokes
`dispose_fixed_fixture`. The original observer sends the credential-checked
fixed-fixture release request, waits for the original keeper's successful exit
and pidfd exit, confirms the receipt is unchanged and audits the charged root.
Windows correlates the disposal report with the complete original refusal report,
waits for observer exit, drains readers and audits collector accounting. Final
close follows disposal, preventing a circular wait between the close guard and
the disposal command.

The observer's disposal command reader keeps waiting on EOF or malformed input.
Those paths are implemented conservatively but were not separately fault-injected
in this cohort. Failed or unconfirmed settlement retains ownership and earns no
cleanup credit. There is no forced final drain for an unqualified holder.

Both snapshots keep the unknown outcome, cleanup denial, disabled automatic
retry/deletion and disabled native admission. Only the custody and fixture-disposal
status changes, from `held` to `disposed-fixed-fixture`. Disposal takes place outside
credited phase timing and cannot extend deadlines or repair the earlier result.

## Verified cases

| Scenario | Windows Job emptiness | Before disposal | After explicit disposal |
| --- | --- | --- | --- |
| Owner exit | Observed empty | Unknown with keeper held | Unknown with fixture disposed |
| Heartbeat stall | Observed empty | Unknown before Windows fallback | Unknown with fixture disposed |
| Guardian loss | Unverified | Unknown with keeper held | Unknown with fixture disposed |

All three lifecycle tests verify that premature final close refuses to release
ownership and that offering the original witness again cannot earn cleanup
credit after disposal. Two boundary tests reject premature disposal and twelve
malformed, mismatched or promoted result variants.

Five tests passed in normal and optimized Windows Python. Linux uses `-I -S -B`;
Linux optimization is not qualified. From the project root on the existing
Windows/Ubuntu setup:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/scheduled-unknown/check.py
```

This verifies saved hashes, deterministic composition and the closed public
verdict schema offline. Add `--develop` to execute the five tests. Public records
include phase timings and before/after verdicts. Runtime paths, identities and
receipt contents stay in protected local captures. Hashes detect drift and do
not provide signed provenance. Prior sealed cohorts remain unchanged.

## Remaining limits

The existing service and collector budgets, designated mount limits and shared
phase deadlines remain in force. The fixture receipt remains capped at 4 KiB.
Holding an unknown mount can outlive the observation schedule; it is not a
lifetime storage quota or a real-time termination guarantee.

This qualification covers refusal with the original observer alive. Observer
loss during unknown holding, replacement-owner authentication, keeper failure,
collector restart, reboot survival and hostile same-UID actors remain
unqualified. Historical keeper liveness is an observation, not continuous
Windows attestation. A receipt cannot recover an already lost mount.

Next: qualify ownership after observer loss and a bounded replacement-owner
recovery protocol. Native uncertain state must remain blocked until that
boundary is addressed. L1/L2 remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1
HOLD. C0 configuration and final-PATH observation remain separate pending work.

# Bundled ConPTY process faults — 16 October 2026

The corrected native run passed the unchanged isolated-fault contracts with the
experimental bundled ConPTY backend. Six exact-PID module observations cover
the original five workers and the replacement; all loaded the packaged DLL.
Prelaunch source and backend binary hashes match after execution.

| Fault | Recorded result |
|---|---|
| SQLite writer killed with an open transaction | Exact 10,000-event committed prefix recovered; 1,000 uncommitted events absent |
| Separate recovery reader | Continued to 50,000 events; full digest, SQLite/FTS integrity and clean reopen passed |
| Original member-zero worker killed | Contiguous 19-record prefix, no end marker, abnormal worker termination |
| Four survivor workers and fresh member-zero replacement | All 300 ordered records each, end markers and clean exits |
| Captured process identities | All 14 recorded roles exited before marked-runtime cleanup |

Only captured child objects were terminated, after the existing process-start
identity checks. This is isolation plus a fresh process; the killed task's lost
tail is not recovered. The database fault remains a synthetic process-crash
case, with no power-loss, machine-reboot or production write-path claim.
Console-helper processes are outside the captured role roster, so whole-tree
cleanup and whole-host recovery remain unqualified.

## Failed first attempt

The [first-attempt manifest](failed-attempt/manifest.json) preserves twelve
measured source snapshots and hashes for thirteen retained capture files.
It failed at final shared-policy validation because the copied runner emitted
`tiye-s5-bundled-faults-v1`, while the unchanged validator requires
`tiye-s5-recovery-v1`. No structured native result was persisted, so that attempt
has no recovery or cleanup qualification. Its marked runtime remains retained.

The correction changes only that schema identifier. The checker verifies this
one-change relationship against the snapshot and hashes every failed capture.
The corrected second run has its own prelaunch manifest and native result;
its successful assertions do not retroactively qualify the first attempt.

## Artifacts and commands

- [Corrected native output](../../../../output/s5-bundled-faults)
- [Failed-attempt output](../../../../output/s5-bundled-faults-attempt-1)
- `evidence-recovery.json`: corrected native result, hashes and explicit verdict scope
- [Shared contract](../recovery/recovery-policy.js): unchanged fault validation

Using the existing S1 dependencies, from the repository root:

```powershell
rtk proxy node feasibility/s5-performance/ui/bundled-faults/check-evidence.js
rtk proxy node feasibility/s5-performance/ui/bundled-faults/check-evidence.js --runtime
```

The runtime option also verifies the installed backend binary hashes. Probes
refuse existing observations/output. Earlier system-backend recovery artifacts
remain unchanged. See the [paired resource report](../bundled-resources/README.md)
for the overall backend verification and delegation scope. Full S5, product
core, whole-process-tree cleanup and production eligibility remain open.

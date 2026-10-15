# Bundled ConPTY renderer recovery — 16 October 2026

The separate native renderer-crash run passed with node-pty's experimental
`useConptyDll:true`. All five workers reported the packaged DLL loaded in their
own process. DLL and adjacent OpenConsole binary hashes were captured before
launch and checked after exit. The old system-backend experiment is unchanged.

One owned renderer was force-crashed (`reason=crashed`, exit code 2). Main,
SQLite feed and five workers/producers retained all 12 persistent identities.
Each PTY emitted seven further records after confirmed renderer death. A fresh
renderer replayed the bounded main journal into five new xterm instances, then
verified exactly 600 ordered records and each end marker. The surviving feed
reached 50,000 events, with exact queries, full digest, SQLite/FTS integrity and
clean reopen. One deliberate stale-epoch ACK was rejected without advancing the
replacement's ledger.

The crash-request → outage-cut ACK/feed-DOM milestone was **391.21 ms**. This is
one observation, with no physical-paint, input-latency or performance-target
claim. The fixture remains the earlier short ASCII record stream at fixed
100×12 geometry; it does not establish crash/replay equivalence for the separate
Unicode resize case, terminal styles, alternate-screen programs or arbitrary
histories. No product core or provider call is involved.

The native assertions and unchanged shared
[recovery policy](../renderer-recovery/evidence-policy.js) verify file hashes,
chunk-sensitive receipt chains, actual buffer records, epoch transitions, role
continuity, feed pages and 11 child exit observations. Normal marked-runtime
cleanup completed. Console-helper process identities are not inventoried, so
this is not whole-process-tree or whole-host recovery/cleanup qualification.

## Evidence and checks

The [public capture](../../../../output/s5-bundled-recovery) retains decoded logs,
original chunk boundaries, observed DLL modules and the prelaunch manifest.
`evidence-renderer.json` contains the native result and measured source/build
hashes. The runner refuses an existing observation/output. Local bundles and
runtime/dependency files remain ignored.

From the repository root, using the existing S1 dependencies:

```powershell
rtk proxy node feasibility/s5-performance/ui/bundled-recovery/check-evidence.js
rtk proxy node feasibility/s5-performance/ui/bundled-recovery/check-evidence.js --runtime
```

The second command also requires the recorded local bundles and packaged backend
binaries. Earlier renderer-recovery source/evidence remains byte-identical.
Full S5, main/machine death, repeated faults, product recovery and production
eligibility remain unqualified. See the [paired resource report](../bundled-resources/README.md)
for the broader backend verification step and delegation scope.

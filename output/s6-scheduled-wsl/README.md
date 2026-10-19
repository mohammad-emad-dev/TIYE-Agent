# Live synthetic Windows/Ubuntu deadline integration

19 October 2026

The shared deadline coordinator now drives real Windows/Ubuntu fixture adapters.
Four live tests cover owner exit, heartbeat stall, guardian loss and cancellation
after actual launch but before acknowledgment. Two offline publication tests
reject changed sources, altered deadlines and promoted unknown verdicts.

**Native provider execution remains disabled.** These fixtures launch Python,
WSL and a fixed transient user service. They perform no provider initialization,
login, credential-backend or model request. Development delegation is separate.
L1/L2 remain PARTIAL, P1/P2 OPEN, A1 BLOCKED and Phase 1 HOLD.

## What now runs together

`ScheduledRun` uses the sealed `Coordinator` and `NativeSchedule` with one actual
Windows monotonic origin. Every blocking adapter runs through `asyncio.to_thread`
inside `Coordinator.perform`; queue time and operation completion consume the
phase allowance. Exact-cutoff completion earns no credit.

| Phase | Actual fixture operation | Bound |
| --- | --- | --- |
| host-start | Allocate protected case storage and prepare independent Linux observer | 30 seconds from entry |
| child-start | Launch independent guardian; it owns the heartbeat owner and WSL transport Job | 15 seconds from entry |
| initialize | Hold exact Windows root/transport handles and receive bound Linux pidfd readiness | 15 seconds from entry |
| eof | Inject selected loss and send the observer command | 5 seconds from entry |
| observe | Collect Linux/guardian results, drain, verify handles, audit budgets and close settled resources | 15 seconds from entry |

Work phases are clipped to origin + 60 seconds. EOF fixes the cleanup cutoff at
the earlier of EOF entry + 15 seconds or origin + 75 seconds. Observation is
clipped to origin + 90 seconds. This composition additionally requires the full
cleanup confirmation before the shared cleanup cutoff. Saved records include
actual phase entries, returns and cutoffs and reject overdue passing results.
Early phase completion advances immediately; these are not fixed cumulative
30/45/60-second milestones.

The `initialize` label denotes synthetic readiness, not a provider protocol
handshake. The EOF phase injects fixture loss, not native protocol EOF. TERM/KILL
adapters are not exercised by this composition. The old independent five-second
Windows watchdog, one-second Linux receipt lease, 20-second systemd runtime
fallback and two-second stop timeout remain unchanged. They are additional
fixture policies, not the native shared schedule's independent OS enforcement.

The Linux observer runs outside the Job/service. It holds main/leaf pidfds and
checks the exact service invocation, cgroup and unrelated sentinel. A new-session
leaf remains in the cgroup. Windows held process signals alone never establish
Linux death. All three ordinary loss cases use actual independent Linux evidence.
Guardian loss retains a null Windows Job-empty report and therefore remains
unknown under the stronger coordinator cleanup rule.

## Unknown launch acknowledgment

The fourth case launches the real guardian but withholds an async acknowledgment.
The harness cancels the caller after the launch call returns. The coordinator
retains the pending operation and case handles and reports unknown. The measured
snapshot has one unsettled operation, no cleanup credit and no retry permission.

The harness then releases acknowledgment and explicitly waits for settlement
outside the credited schedule, retaining unknown. Only after the task settles
does it close the independent observer and collector. Any rescue in that path
earns no cleanup credit. This tests lost acknowledgment after a completed launch;
it does not prove behavior of an indefinitely blocked `Popen`, a collector crash
or restart discovery. There is no automatic relaunch or deletion.

## Ownership, accounting and source binding

The adapter reuses the sealed charged-WSL sources without modifying them. Original
worker/control messages remain bound to that frozen source set and per-run nonce.
The separate protected test-harness attempt records the full new source set
before execution and checks that it did not change afterward. This consistency
check is not independent code attestation or a new production admission record.

Per-case Windows captures/control records use the original disjoint collector
and worker subleases within the 1 MiB metadata budget. Linux runtime contents use
the separate 128 KiB role budget. Observer diagnostics share the same per-case
collector ledger. Successful observation audits final owned files before closure.
The cancellation case retains uncertain prefixes without fabricating a successful
final audit. Its harness diagnostics use a separate protected harness allocation.
These content counters are not OS quotas; system-manager logs and arbitrary
external writes remain outside them.

Raw identities, diagnostics and runtime paths remain in protected LOCALAPPDATA
storage and private Linux runtime directories. Only allowlisted relative timing
and verdict fields appear in [observations](observations.json). Local `.git`
selection files contain safe results/source hashes and protected-root locators.

`asyncio.to_thread` cannot cancel a blocking call. The test harness uses an
explicit event loop, retains unresolved tasks and waits for their finite
settlement before closing resources or shutting down its executor. Settlement
and executor shutdown are outside credited phase timings. If settlement fails,
the harness retains the loop/run and fails; it makes no bounded interpreter-exit
claim. Arbitrary stuck executor threads, machine suspension, hostile descendants,
disk failure and collector loss remain unqualified. No teardown mechanism here
can make those operations safe to forget.

## Verification

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/scheduled-wsl/check.py --develop
rtk proxy python -B -O -X utf8 feasibility/s6-wsl/scheduled-wsl/check.py --develop
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/scheduled-wsl -p test_publication.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/scheduled-wsl/check.py
```

All four live cases pass in normal and optimized Windows harness modes. The two
offline publication tests pass in both modes. Linux fixture execution remains
`-I -S -B` in both runs; Linux `-O` is not separately qualified. The earlier
charged-WSL, deadline-recovery and native-preflight/contract offline checks also
pass. [Manifest](evidence.json) binds exact source, artifact and reference hashes.

Luna and GLM completed supplied-context design reviews without tools or edits;
neither performed a final-source audit or ran these tests. [Review](review.json)
records adopted findings and rejected assumptions. Gemini remains excluded under
the recorded consumer-route decision. DeepSeek fallback was unnecessary.

**Next:** finish the native effective configuration/helper inventory and evaluate
separate U0 admission. Unknown blocked-spawn, durable restart recovery and
collector-loss qualification remain open and cannot be inferred from these four
finite fixture cases. Authenticated provider eligibility remains separate.

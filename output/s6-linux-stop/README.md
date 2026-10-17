# Active Linux Stop — controlled cleanup

17 October 2026. This step advances TIYE's Stop requirement from post-root-exit
cleanup to stopping a workload while both its root and separate-session child
are live. It is a controlled Ubuntu component test, not the completed application
Stop button or a native provider qualification.

## Behavior and acceptance

[`stop_owned`](../../feasibility/s6-wsl/linux-stop/stop.py) gives TERM a 250 ms
phase inside a two-second normal-await cleanup budget, then repeatedly discovers
and KILLs remaining owned children. Discovery continues after root termination,
including during KILL escalation. Newly visible children receive the signal for
the current phase; a child first adopted in the KILL phase is not given a new
TERM grace period.

The new [`Owner`](../../feasibility/s6-wsl/linux-stop/owner.py) version validates
all live recorded identities before each batch. `send_once` records successful
requests by held pidfd and signal number, avoiding repeated TERM requests while
still reaching newly adopted children. Those descriptors remain open until close.
This version uses an immutable snapshot identity and reaps the owned processes.
The prior [Linux ownership capture](../s6-linux-owner/README.md) is unchanged.

| Case | Expected signal requests | Independently observed exits |
| --- | --- | --- |
| Graceful root and child | Two TERM, zero KILL | Root -15 and child -15 |
| Child ignores TERM | Two TERM, one KILL | Root -15 and child -9 |
| Root and child ignore TERM | One TERM, two KILL | Root -9 and subsequently adopted child -9 |

The observer holds independent root and child pidfds before requesting Stop and
checks start times and the public nonce. It verifies the child is in a separate
session and still parented by the root before Stop. Both original processes must
then exit and disappear from `/proc`, their statuses must be reaped, and an
unrelated sibling sentinel must remain live. Saved owner identities must match
the observer's instances. Passing cleanup takes less than 2.1 seconds on the
recorded host; this includes a 100 ms observation tolerance and is not a platform
latency guarantee. Ten-second fixture expiry cannot satisfy that acceptance.

## Running and saved evidence

From the repository root, verify the frozen capture without starting WSL:

```powershell
rtk proxy python -B -X utf8 feasibility/s6-wsl/linux-stop/run.py
```

`--develop` starts a new fixed mock cohort and stores its evidence privately
under `.git`. `--capture` requires this README and `review.json` and refuses an
existing input file. Do not overwrite the saved public cohort. The runner uses
an explicit Ubuntu distribution, non-root UID 1000, an allowlisted environment,
a bounded hash-verified five-file source bundle and retained private runtime
directories. Linux test timeout is 25 seconds; the WSL host timeout is 35 seconds.
No provider, account login, model request, installation, network change,
distribution shutdown or recursive deletion is part of this fixture.

[Input](input.json), [raw WSL stdout](wsl.stdout.bin), [raw stderr](wsl.stderr.bin)
and [evidence](evidence.json) retain source hashes, bounds, host exits and actual
test observations. The stdout envelope contains exact Linux/Python versions and
base64-encoded test output. [Review provenance](review.json) distinguishes
delegation outcomes from parent verification.
Codex supplied the initial Stop function. Muse was unavailable and the authorized
DeepSeek fallback exited without review text. The parent reviewed the final code
and ran the tests; no independent completed code review is claimed.

## What this closes and what remains

This closes the three controlled active-Stop cases above, including adoption
after forced root death. It does not qualify arbitrary provider trees, hostile
namespaces, fork storms, concurrent recovery, abrupt supervisor death, machine
reboot or hard bounds on synchronous OS operations. A timeout or identity failure
cannot be reported as successful cleanup. The fixture supervisor attempts a
separate one-second emergency cleanup in `finally`; that attempt cannot change
a failed normal result into a pass. Its observer separately stops its own
`Popen` sentinel/supervisor instances during teardown.

Next admission work is native Linux/host integration with explicit crash ownership
and private capture review. The U0 provider path remains disabled; S4/S6 remain
partial and Phase 1 remains HOLD. Core product construction has not started.

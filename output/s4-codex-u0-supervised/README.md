# U0 supervision integration candidate

17 October 2026. This candidate connects the frozen corrected Windows watchdog
to the existing U0 pipe transport and envelope parser using synthetic Windows
processes. It does not connect the watchdog to a native WSL capture. The original
launcher and watchdog source and saved captures remain unchanged.

## Execution path

```text
independent Windows watchdog
  Windows Job Object
    synthetic host using U0 WorkerOutput and observe
      synthetic worker using U0 Handshake and observe
        synthetic protocol peer or finite sleeper
```

The watchdog assigns the host to its job at creation and records readiness before
resuming it. Windows descendants inherit membership. The host uses the original
U0 bounded concurrent pipe transport rather than a replacement pipe mock. Its
worker exercises the original protocol peer. Worker environments are allowlisted;
the outer watchdog and its host inherit the synthetic runner's environment.
This is not credential, filesystem or network isolation.

The default entry point checks source syntax and hashes without launching a
process. `--capture` on that entry point rejects native execution unconditionally.
Synthetic launches accept only the fixed Python fixture modes and require a
fresh exclusive `input.json`. That manifest remains after exit and blocks reuse
of the directory. There is no automatic unlock or automatic retry. Historical
dependency source hashes are checked against their saved evidence before launch.
The new candidate's hashes are recorded before and checked after the saved test
run; these receipts are not an immutable execution snapshot or a security boundary
against another process that can edit the checkout.

## Verification

From the project root on Windows:

```powershell
rtk proxy python -B -X utf8 -m unittest discover -s feasibility/s6-wsl/codex-u0-supervised -p test_supervised.py -v
rtk proxy python -B -X utf8 feasibility/s6-wsl/codex-u0-supervised/run.py
rtk proxy python -B -X utf8 feasibility/s6-wsl/codex-u0-supervised/record.py
```

The first command runs real synthetic Windows processes. The second is offline.
The third checks the saved capture without launching another process. The
separate recorder's `--capture` runs one exclusive synthetic test capture and
refuses an existing input record. It requires this README and a completed
`review.json` before running. The saved checker pins this cohort's test count and
case set; later changes require a new cohort. It never grants native admission.

The saved [test log](tests.log), [observations](observations.json) and
[evidence manifest](evidence.json) distinguish these cases:

- Matching handshake and peer notification witness with clean pipe EOF
- Foreign handshake response retained as failure after successful cleanup
- Corrupted embedded raw stream rejected with a saved validation fault after a valid exchange
- Blocked host stopped with its worker and peer at the outer deadline
- Host exit 7 while descendants remain live until the outer deadline
- Watchdog crash with independent held-handle death witnesses and a live unrelated sentinel
- Native capture refused before launch artifacts are created
- Existing run record preserved while a second launch is refused

The parent opens process handles and checks creation times and nonces before
intervening. Exit witnesses use those held handles rather than later PID lookup.
Protocol outcomes and cleanup observations remain separate. A missing completion
report after forced termination is not a successful protocol result. Deadline
cases measure stop-decision lateness separately from cleanup observation.

## Remaining work

The synthetic host/worker bridge is not the native Linux worker. The qualification
fixture invokes no Linux process or provider CLI and sends no authentication or
model requests. Delegated code generation and review used the requested model
services separately and do not qualify a product integration route. The
original native-launch lock remains unchanged. Windows job emptiness cannot prove
Linux tree death. Process creation, kernel scheduling and watchdog file writes
are not independently hard-bounded. The finite sleeper lifetimes are fixture
fallbacks and are not native cleanup guarantees. No simultaneous boundary race
between normal completion and deadline expiry is qualified by these cases.

Next: qualify Linux ownership/recovery and private capture access, then design a
separately reviewed native host integration and admission record. Authenticated
cases still require the applicable provider route. S4/S6 remain partial and
Phase 1 remains **HOLD**.

Delegation scope and parent dispositions are recorded in [review.json](review.json).
